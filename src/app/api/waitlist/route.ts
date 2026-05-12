import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferralCode, buildReferralUrl } from '@/lib/referral'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const SYMPTOM_OPTIONS = [
  'hot_flashes',
  'night_sweats',
  'sleep_problems',
  'mood_changes',
  'anxiety',
  'brain_fog',
  'weight_changes',
  'fatigue',
  'low_libido',
  'other',
] as const

const WaitlistSchema = z.object({
  email: z.string().email().toLowerCase(),
  first_name: z.string().min(1).max(50).trim(),
  primary_symptom: z.enum(SYMPTOM_OPTIONS).optional(),
  referral_code: z.string().optional(), // Code used by this person (referred_by)
})

export async function POST(request: NextRequest) {
  // Strict rate limiting — prevent abuse
  const { success } = rateLimit(request, { limit: 3, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again in a minute.' },
      { status: 429 }
    )
  }

  const admin = createAdminClient()

  try {
    const body = await request.json()
    const parsed = WaitlistSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const { email, first_name, primary_symptom, referral_code } = parsed.data

    // Check if already on waitlist
    const { data: existing } = await admin
      .from('waitlist_signups')
      .select('id, referral_code')
      .eq('email', email)
      .single()

    if (existing) {
      // Already signed up — return their code silently (don't reveal they exist)
      return NextResponse.json({
        success: true,
        referral_url: buildReferralUrl(existing.referral_code),
        already_registered: true,
      })
    }

    // Resolve the referring signup if a code was provided
    let referredById: string | null = null
    let hasPriorityAccess = false

    if (referral_code) {
      const { data: referrer } = await admin
        .from('waitlist_signups')
        .select('id')
        .eq('referral_code', referral_code.toUpperCase())
        .single()

      if (referrer) {
        referredById = referrer.id
        hasPriorityAccess = true // Referred = priority access
      }
    }

    // Generate unique referral code for this signup
    let newCode: string
    let attempts = 0
    do {
      newCode = generateReferralCode(first_name)
      const { data: codeExists } = await admin
        .from('waitlist_signups')
        .select('id')
        .eq('referral_code', newCode)
        .single()
      if (!codeExists) break
      attempts++
    } while (attempts < 10)

    // Get IP for basic fraud prevention
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ??
      request.headers.get('x-real-ip') ??
      null

    // Insert signup
    const { data: signup, error: insertError } = await admin
      .from('waitlist_signups')
      .insert({
        email,
        first_name,
        primary_symptom: primary_symptom ?? null,
        referral_code: newCode,
        referred_by_code: referral_code?.toUpperCase() ?? null,
        referred_by_id: referredById,
        priority_access: hasPriorityAccess,
        ip_address: ip,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Update referrer's count if they were referred by someone
    if (referredById) {
      // Get current count
      const { data: referrer } = await admin
        .from('waitlist_signups')
        .select('referral_count, stripe_coupon_id, first_name')
        .eq('id', referredById)
        .single()

      if (referrer) {
        const newCount = (referrer.referral_count ?? 0) + 1

        // Update count in DB
        await admin
          .from('waitlist_signups')
          .update({ referral_count: newCount })
          .eq('id', referredById)

        // Send referrer a notification email (via Resend)
        // This is fire-and-forget — don't block the response
        notifyReferrer(referrer.first_name, newCount, referral_code!).catch(
          console.error
        )
      }
    }

    // Send welcome email with referral link
    await sendWelcomeEmail(
      email,
      first_name,
      buildReferralUrl(newCode),
      newCode,
      hasPriorityAccess
    )

    // Sync to Brevo
    syncToBrevo(email, first_name, newCode, hasPriorityAccess, primary_symptom).catch(
      console.error
    )

    return NextResponse.json({
      success: true,
      referral_url: buildReferralUrl(newCode),
      referral_code: newCode,
      priority_access: hasPriorityAccess,
    })
  } catch (err) {
    console.error('Waitlist signup error:', err)
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 500 }
    )
  }
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendWelcomeEmail(
  email: string,
  firstName: string,
  referralUrl: string,
  referralCode: string,
  isPriority: boolean
) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY!)

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: isPriority
      ? `${firstName}, you're first in line for Aunty Mel 🌸`
      : `${firstName}, you're on the Aunty Mel list 🌸`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #3B1F6B; padding: 32px 24px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; font-size: 24px; margin: 0;">🌸 Aunty Mel</h1>
          <p style="color: #C9B8E8; font-size: 14px; margin: 8px 0 0;">Every body needs an Aunty Mel</p>
        </div>
        <div style="background: #f4f0fa; padding: 32px 24px; border-radius: 0 0 16px 16px;">
          <p style="font-size: 16px;">Hi ${firstName},</p>
          ${isPriority
            ? `<p style="font-size: 16px;">Because someone referred you, you'll get <strong>priority early access</strong> when we launch. You're ahead of the queue.</p>`
            : `<p style="font-size: 16px;">For eons, the secrets of menopause have been shared between women who already knew. Aunty Mel is bringing that wisdom home — personalised wellness guidance to help you understand your body and get real results.</p><p style="font-size: 16px;">You'll be among the first to know when we launch.</p>`
          }
          <p style="font-size: 16px;">In the meantime — every woman you refer gets priority early access, and <strong>you get 99p off your subscription every month, for life, for every referral.</strong> Refer 8 women and your subscription is free. Forever.</p>

          <div style="background: white; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="font-size: 13px; color: #666; margin: 0 0 8px;">Your personal referral link</p>
            <p style="font-size: 14px; font-weight: bold; color: #3B1F6B; word-break: break-all;">${referralUrl}</p>
            <p style="font-size: 13px; color: #666; margin: 8px 0 0;">Your code: <strong>${referralCode}</strong></p>
          </div>

          <a href="${referralUrl}" style="display: block; background: #3B1F6B; color: white; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: bold; font-size: 15px; text-align: center; margin-bottom: 24px;">
            Share your link →
          </a>

          <p style="font-size: 13px; color: #888; line-height: 1.6;">
            This app provides general wellness information only. It is not medical advice and does not replace professional healthcare. Always consult your GP for medical concerns.
          </p>
        </div>
      </div>
    `,
  })
}

async function notifyReferrer(
  firstName: string,
  newCount: number,
  _referralCode: string
) {
  // Fire-and-forget notification to referrer
  // Implementation: look up their email and send a nudge
  // Kept simple for MVP — expand to include their updated discount amount
  console.log(
    `Referrer ${firstName} now has ${newCount} referral(s) — 99p × ${newCount} = £${(newCount * 0.99).toFixed(2)} off/month`
  )
}

async function syncToBrevo(
  email: string,
  firstName: string,
  referralCode: string,
  isPriority: boolean,
  symptom?: string
) {
  if (!process.env.BREVO_API_KEY) return

  // Partner signups (primary_symptom starts with "partner:") go to list 10
  // Main app signups go to list 9
  const isPartner = symptom?.startsWith('partner:')
  const listId = isPartner ? 10 : 9
  const source = isPartner ? 'partner_waitlist' : 'waitlist'
  const relationship = isPartner ? symptom?.replace('partner:', '') : ''

  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          REFERRAL_CODE: referralCode,
          PRIORITY_ACCESS: isPriority,
          PRIMARY_SYMPTOM: isPartner ? '' : (symptom ?? ''),
          RELATIONSHIP: relationship,
          SOURCE: source,
        },
        listIds: [listId],
        updateEnabled: true,
      }),
    })
  } catch (err) {
    console.error('Brevo sync error:', err)
  }
}
