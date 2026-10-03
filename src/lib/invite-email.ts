import type { SupabaseClient } from '@supabase/supabase-js'
import { DISCLAIMER } from '@/lib/disclaimer'
import { findUserByEmail, type FoundUser } from '@/lib/find-user'

/**
 * Sending the "here is your link into the app" email for an admin invite.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 *
 * Every admin invite route used to call `auth.admin.inviteUserByEmail()` and
 * treat the error "User already registered" as a harmless non-event:
 *
 *     if (inviteError.message.includes('already registered')) {
 *       alreadyRegistered = true      // ...and then carry on
 *     }
 *
 * It is not harmless. Supabase refuses that call outright, so **no email is
 * sent at all** — and the admin panel still reported "Invited ✓". The invitee
 * is told by a human that her invite is on its way and nothing ever arrives.
 *
 * That case is not an edge case, it is the common one. An account already
 * exists for anyone who has been invited before, because the first invite
 * created the auth user whether or not she ever managed to use the link. So
 * every *re-invite* — exactly what an admin does when someone says "I never got
 * it" — silently sent nothing, and reported success. The failure compounded:
 * the more times she was chased, the more certain it became that she would
 * never receive anything.
 *
 * ── What this does instead ───────────────────────────────────────────────────
 *
 * A new account still gets the ordinary Supabase invite email. An account that
 * already exists gets a real magic-link email instead of silence: the link is
 * generated with `auth.admin.generateLink()` (which mints a link but sends
 * nothing itself) and delivered through Resend, the same transactional sender
 * the waitlist emails already use.
 *
 * The return value says which of those actually happened, so that callers can
 * record it and the admin panel can stop claiming an email was sent when none
 * was. Nothing here throws: an invite has irreversible side effects downstream
 * (a Stripe subscription, a geo override), so the outcome has to be reportable
 * rather than raised.
 *
 * ── The second half of the same bug ──────────────────────────────────────────
 *
 * The fix above keyed the fallback off Supabase *refusing* the invite, and that
 * refusal only happens for a **confirmed** account. For an account that exists
 * but has never been confirmed — which is every invitee who has not yet signed
 * in — `inviteUserByEmail()` does not refuse. It succeeds, re-sending
 * Supabase's own invite email and bumping `invited_at` / `confirmation_sent_at`.
 *
 * So the reliable Resend path was never reached for the people who needed it
 * most, and the log recorded `email_status = 'invite_sent'`,
 * `already_registered = false` for them — reporting a brand-new invite each
 * time. Observed live: 11 of 14 invited testers, every one of them an existing
 * unconfirmed account, repeatedly re-invited over a month and none of them ever
 * confirmed or signed in.
 *
 * The existence of the account is therefore established *first*, by lookup,
 * rather than inferred from an error message. Anyone who already has an account
 * gets the Resend magic link whether or not they ever confirmed; Supabase's
 * invite email is used only for an address with no account at all.
 */

/** What actually happened to the invitee's email. */
export type InviteEmailStatus =
  /** Supabase sent its invite email — a brand-new account. */
  | 'invite_sent'
  /** The account already existed; we sent a fresh magic link via Resend. */
  | 'magic_link_sent'
  /** Nothing reached them. `error` says why, and it needs a human. */
  | 'not_sent'

export interface InviteEmailResult {
  status: InviteEmailStatus
  /** True when no email reached the invitee — the case worth shouting about. */
  failed: boolean
  /** The invitee's auth user id, when it could be resolved. */
  userId: string | null
  /** True when the account already existed before this invite. */
  alreadyRegistered: boolean
  /** Whether that account has ever signed in (null when unknown). */
  lastSignInAt: string | null
  /** Human-readable reason, present whenever status is 'not_sent'. */
  error: string | null
}

export interface SendInviteEmailParams {
  email: string
  /** Where the link should land them once Supabase has verified it. */
  redirectTo: string
  /** Used to personalise the fallback email; also stored as user metadata. */
  firstName?: string | null
  /** Extra user metadata to attach on the Supabase invite. */
  data?: Record<string, unknown>
}

/**
 * Supabase reports an existing account through the message text rather than a
 * distinct code, and has used more than one wording ("User already registered",
 * "A user with this email address has already been registered"). Match on the
 * stable part of every variant rather than one exact string.
 */
function isAlreadyRegistered(message: string): boolean {
  return message.toLowerCase().includes('already') && message.toLowerCase().includes('regist')
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; name?: unknown }
    if (typeof e.message === 'string' && e.message) return e.message
    try {
      return JSON.stringify(err)
    } catch {
      // Unserialisable — fall through.
    }
  }
  return String(err)
}

/**
 * Send someone their way into the app, whether or not they already have an
 * account. Requires a service-role client (`createAdminClient()`).
 */
export async function sendInviteEmail(
  admin: SupabaseClient,
  params: SendInviteEmailParams,
): Promise<InviteEmailResult> {
  const email = params.email.trim().toLowerCase()

  const metadata: Record<string, unknown> = { ...(params.data ?? {}) }
  if (params.firstName) metadata.first_name = params.firstName

  // ── 0. Does an account already exist? ─────────────────────────────────────
  //
  // Asked before inviting, not inferred from the invite's error afterwards.
  // inviteUserByEmail() only objects to a *confirmed* account, so an existing
  // unconfirmed one would otherwise be sent Supabase's invite email again and
  // never reach the Resend path below. See the note at the top of this file.
  const existing = await findExistingUserQuietly(admin, email)
  if (existing) {
    return sendMagicLinkToExistingUser(admin, email, params, existing)
  }

  // ── 1. New account: Supabase's own invite email ───────────────────────────
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
      redirectTo: params.redirectTo,
    })

    if (!error) {
      return {
        status: 'invite_sent',
        failed: false,
        userId: data?.user?.id ?? null,
        alreadyRegistered: false,
        lastSignInAt: data?.user?.last_sign_in_at ?? null,
        error: null,
      }
    }

    if (!isAlreadyRegistered(error.message)) {
      // A genuine failure — bad SMTP credentials, a rate limit, a rejected
      // redirect URL. Report it verbatim; this is the text an admin needs.
      return {
        status: 'not_sent',
        failed: true,
        userId: null,
        alreadyRegistered: false,
        lastSignInAt: null,
        error: `Supabase could not send the invite email: ${error.message}`,
      }
    }
  } catch (err) {
    return {
      status: 'not_sent',
      failed: true,
      userId: null,
      alreadyRegistered: false,
      lastSignInAt: null,
      error: `Supabase could not send the invite email: ${describe(err)}`,
    }
  }

  // ── 2. Existing account: mint a magic link and send it ourselves ──────────
  //
  // Still reachable, and deliberately: the lookup above can miss an account
  // created between that call and this one, and it is skipped entirely when
  // the lookup itself fails. Supabase refusing the invite is then the only
  // remaining signal that the address is taken.
  return sendMagicLinkToExistingUser(admin, email, params, null)
}

/**
 * Resolve an existing account without letting the lookup break the send.
 *
 * A failing lookup must not block an invite: it would turn a transient auth-API
 * error into "nobody can be invited". Returning null falls through to the
 * invite path, which still has Supabase's refusal as a backstop.
 */
async function findExistingUserQuietly(
  admin: SupabaseClient,
  email: string,
): Promise<FoundUser | null> {
  try {
    return await findUserByEmail(admin, email)
  } catch (err) {
    console.error(
      `sendInviteEmail: could not check whether ${email} already has an account; falling back to the invite path:`,
      describe(err),
    )
    return null
  }
}

async function sendMagicLinkToExistingUser(
  admin: SupabaseClient,
  email: string,
  params: SendInviteEmailParams,
  known: FoundUser | null,
): Promise<InviteEmailResult> {
  const base = {
    alreadyRegistered: true,
    // Seeded from the lookup so the caller still learns who this is, and
    // whether they have ever signed in, even if generateLink() answers without
    // a user object. scheduleComplimentaryPremium() defers the twelve months to
    // first sign-in on exactly that signal, so losing it would spend a tester's
    // months while her link sat unread.
    userId: known?.id ?? null,
    lastSignInAt: known?.lastSignInAt ?? null,
  }

  let actionLink: string
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: params.redirectTo },
    })

    if (error) {
      return {
        ...base,
        status: 'not_sent',
        failed: true,
        error:
          `They already have an account, and a replacement sign-in link could not be generated: ${error.message}`,
      }
    }

    actionLink = data.properties.action_link
    base.userId = data.user?.id ?? base.userId
    base.lastSignInAt = data.user?.last_sign_in_at ?? base.lastSignInAt
  } catch (err) {
    return {
      ...base,
      status: 'not_sent',
      failed: true,
      error:
        `They already have an account, and a replacement sign-in link could not be generated: ${describe(err)}`,
    }
  }

  const sent = await deliverViaResend({
    to: email,
    firstName: params.firstName ?? null,
    actionLink,
  })

  if (!sent.ok) {
    return {
      ...base,
      status: 'not_sent',
      failed: true,
      error: `They already have an account, and the sign-in link email failed to send: ${sent.error}`,
    }
  }

  return { ...base, status: 'magic_link_sent', failed: false, error: null }
}

/**
 * Deliver the fallback sign-in link through Resend.
 *
 * Resend is used directly rather than through Supabase because Supabase has no
 * "send this generated link" API — generateLink() deliberately hands the link
 * back for the caller to deliver. It is the same sender the waitlist welcome
 * email already goes through, so the invitee sees a consistent from-address.
 */
async function deliverViaResend(msg: {
  to: string
  firstName: string | null
  actionLink: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not set' }
  if (!from) return { ok: false, error: 'RESEND_FROM_EMAIL is not set' }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: 'Your link into Aunty Mel 🌸',
      html: renderMagicLinkEmail(msg.firstName, msg.actionLink),
    })

    // The Resend SDK reports failures on the response rather than by throwing,
    // so a send that never left the building looks like success unless this is
    // checked. That is the exact class of silent failure this module exists to
    // remove, so it must not be reintroduced here.
    if (error) return { ok: false, error: describe(error) }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: describe(err) }
  }
}

function renderMagicLinkEmail(firstName: string | null, actionLink: string): string {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,'

  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #6b204f; padding: 32px 24px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: white; font-size: 24px; margin: 0;">🌸 Aunty Mel</h1>
        <p style="color: #f0c4e4; font-size: 14px; margin: 8px 0 0;">Every body needs an Aunty Mel</p>
      </div>
      <div style="background: #fff5db; padding: 32px 24px; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;">${greeting}</p>
        <p style="font-size: 16px;">Here is your link into Aunty Mel. Tap the button below and you will be signed straight in — there is no password to remember.</p>

        <a href="${actionLink}" style="display: block; background: #6b204f; color: white; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: bold; font-size: 15px; text-align: center; margin: 24px 0;">
          Open Aunty Mel →
        </a>

        <p style="font-size: 13px; color: #666; line-height: 1.6;">
          If the button does not work, copy this link into your browser:<br />
          <span style="word-break: break-all; color: #6b204f;">${actionLink}</span>
        </p>

        <p style="font-size: 13px; color: #666; line-height: 1.6;">
          This link is single-use and expires. If it has run out, just ask for a new one from the sign-in page.
        </p>

        <p style="font-size: 13px; color: #888; line-height: 1.6;">
          ${DISCLAIMER.short}
        </p>
      </div>
    </div>
  `
}

/**
 * The invitee's name comes from admin-entered form input and is interpolated
 * into an HTML email, so it is escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
