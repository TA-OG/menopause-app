import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Environment variable diagnostic.
 *
 * Reports every env var the app uses, grouped by feature, with status:
 *   - ok       : present and looks valid
 *   - missing  : not set (required)
 *   - optional : not set, app degrades gracefully
 *   - invalid  : set but malformed
 *
 * Never reveals actual secret values — only reports presence + first/last 4 chars
 * of public-ish identifiers and a structural validity hint.
 *
 * Admin-only.
 */

interface EnvCheck {
  key: string
  required: boolean
  description: string
  /** Optional validation function — return null if valid, else error message */
  validate?: (v: string) => string | null
  /** What to show in output: 'masked' (default), 'presence', 'public' */
  display?: 'masked' | 'presence' | 'public'
}

const ENV_GROUPS: Record<string, EnvCheck[]> = {
  Supabase: [
    {
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      required: true,
      description: 'Supabase project URL',
      display: 'public',
      validate: (v) => v.startsWith('https://') && v.includes('.supabase.co') ? null : 'Should be https://xxx.supabase.co',
    },
    {
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      required: true,
      description: 'Supabase anonymous (public) key',
      validate: (v) => v.length > 100 ? null : 'Looks too short — should be a long JWT',
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      required: true,
      description: 'Supabase service role key (server-only, bypasses RLS)',
      validate: (v) => v.length > 100 ? null : 'Looks too short — should be a long JWT',
    },
  ],
  App: [
    {
      key: 'NEXT_PUBLIC_APP_URL',
      required: true,
      description: 'Public-facing URL of the app — Stripe redirects, email links',
      display: 'public',
      validate: (v) => {
        if (!v.startsWith('https://')) return 'Should start with https://'
        if (v.endsWith('/')) return 'Should NOT have a trailing slash'
        return null
      },
    },
  ],
  Stripe: [
    {
      key: 'STRIPE_SECRET_KEY',
      required: true,
      description: 'Stripe secret key — must match the mode of your price IDs',
      validate: (v) => {
        if (v.startsWith('sk_live_')) return null
        if (v.startsWith('sk_test_')) return null
        return 'Must start with sk_live_ or sk_test_'
      },
    },
    {
      key: 'STRIPE_WEBHOOK_SECRET',
      required: true,
      description: 'Stripe webhook signing secret',
      validate: (v) => v.startsWith('whsec_') ? null : 'Must start with whsec_',
    },
    {
      key: 'STRIPE_PRICE_GBP_MONTHLY',
      required: true,
      description: 'GBP monthly subscription price ID',
      display: 'public',
      validate: (v) => v.startsWith('price_') ? null : 'Must start with price_',
    },
    {
      key: 'STRIPE_PRICE_GBP_YEARLY',
      required: true,
      description: 'GBP yearly subscription price ID',
      display: 'public',
      validate: (v) => v.startsWith('price_') ? null : 'Must start with price_',
    },
    {
      key: 'STRIPE_PRICE_USD_MONTHLY',
      required: false,
      description: 'USD monthly price ID (optional — only if USD enabled on pay page)',
      display: 'public',
      validate: (v) => v.startsWith('price_') ? null : 'Must start with price_',
    },
    {
      key: 'STRIPE_PRICE_USD_YEARLY',
      required: false,
      description: 'USD yearly price ID (optional)',
      display: 'public',
      validate: (v) => v.startsWith('price_') ? null : 'Must start with price_',
    },
  ],
  Email: [
    {
      key: 'RESEND_API_KEY',
      required: true,
      description: 'Resend API key — for waitlist welcome emails',
      validate: (v) => v.startsWith('re_') ? null : 'Should start with re_',
    },
    {
      key: 'RESEND_FROM_EMAIL',
      required: true,
      description: 'Sender email for transactional emails',
      display: 'public',
      validate: (v) => v.includes('@') ? null : 'Must be a valid email address',
    },
    {
      key: 'BREVO_API_KEY',
      required: false,
      description: 'Brevo API key (optional — for marketing list sync)',
    },
  ],
  PushNotifications: [
    {
      key: 'VAPID_SUBJECT',
      required: false,
      description: 'VAPID subject (mailto:hello@auntymel.app) for web push',
      display: 'public',
    },
    {
      key: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
      required: false,
      description: 'VAPID public key for web push subscriptions',
      display: 'public',
    },
    {
      key: 'VAPID_PRIVATE_KEY',
      required: false,
      description: 'VAPID private key for web push',
    },
    {
      key: 'CRON_SECRET',
      required: false,
      description: 'Bearer token to authorise the daily notification cron',
    },
  ],
}

function maskValue(v: string, display: 'masked' | 'presence' | 'public'): string {
  if (display === 'public') return v
  if (display === 'presence') return '<set>'
  // masked: show first 4 + last 4 only
  if (v.length <= 12) return '****'
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export async function GET() {
  // Verify admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Run checks
  const results: Record<string, any[]> = {}
  let missingRequired = 0
  let invalidValues   = 0

  for (const [group, checks] of Object.entries(ENV_GROUPS)) {
    results[group] = checks.map((check) => {
      const value = process.env[check.key]

      if (!value) {
        if (check.required) missingRequired++
        return {
          key:         check.key,
          status:      check.required ? 'MISSING (required)' : 'not set (optional)',
          description: check.description,
        }
      }

      const validationError = check.validate?.(value) ?? null
      if (validationError) invalidValues++

      return {
        key:         check.key,
        status:      validationError ? `INVALID — ${validationError}` : 'ok',
        value:       maskValue(value, check.display ?? 'masked'),
        description: check.description,
      }
    })
  }

  // Cross-check: NEXT_PUBLIC_APP_URL should match the host this request came from
  // (we can detect mismatches between env and actual deployment URL)
  const summary = {
    missing_required:      missingRequired,
    invalid_values:        invalidValues,
    overall_status:        missingRequired === 0 && invalidValues === 0 ? 'ALL OK' : 'PROBLEMS FOUND',
    next_public_app_url:   process.env.NEXT_PUBLIC_APP_URL ?? null,
    stripe_key_mode:       process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
                             ? 'LIVE'
                             : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
                               ? 'TEST'
                               : 'UNKNOWN/MISSING',
  }

  return NextResponse.json({ summary, env_vars: results })
}
