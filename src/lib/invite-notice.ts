import type { ComplimentaryStatus } from '@/lib/complimentary-premium-config'

/**
 * The outcome an admin is shown after granting a user access override.
 *
 * Pure and free of any Stripe/Supabase dependency so it can be unit tested and
 * imported by the client-side admin dashboard.
 */
export interface InviteNotice {
  /** 'warn' means something needs a human to follow up. */
  tone: 'ok' | 'warn'
  text: string
}

export interface OverrideGrantOutcome {
  email: string
  /** True when a Supabase invite email was sent because they had no account. */
  invited: boolean
  /** True when the account already existed before this grant. */
  alreadyRegistered: boolean
  /**
   * What actually reached their inbox, from sendInviteEmail(). Optional so an
   * older response shape still renders, but when it says nothing was sent that
   * outranks everything else below — access they are never told about is
   * access they do not have.
   */
  emailDelivery?: {
    status: 'invite_sent' | 'magic_link_sent' | 'not_sent'
    failed: boolean
    error: string | null
  }
  complimentary: {
    status: ComplimentaryStatus
    months: number
    expiresAt: string | null
    error: string | null
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Describe, in plain words, what an access-override grant actually did.
 *
 * The override and the complimentary premium can succeed independently: the
 * override is a row write, the premium is a Stripe subscription. The message
 * must therefore never round "access granted" up to "premium granted" — an
 * admin who is told someone has 12 months of premium, when the grant in fact
 * failed, will not follow it up, and the woman on the other end quietly hits a
 * paywall she was promised she would not see.
 */
export function overrideGrantNotice(outcome: OverrideGrantOutcome): InviteNotice {
  const { email, invited, complimentary, emailDelivery } = outcome
  const months = complimentary.months

  // Reported before anything else, and it short-circuits: an override and 12
  // months of premium are worth nothing to someone who was never told the app
  // exists, so that failure must not be buried under a cheerful summary of the
  // two things that did work.
  if (emailDelivery?.failed) {
    return {
      tone: 'warn',
      text:
        `Access granted for ${email}, but NO email reached them — they do not know. ` +
        `${emailDelivery.error ?? 'No reason was recorded.'} ` +
        `Fix the cause and grant again to send their link.`,
    }
  }

  // How they got here — used as the opening clause of every message.
  const opening = invited
    ? `Invite emailed to ${email}. They have full access`
    : `${email} already had an account, so a fresh sign-in link was emailed instead. They have full access`

  switch (complimentary.status) {
    case 'granted':
      return {
        tone: 'ok',
        text:
          `${opening}, and ${months} months of complimentary premium` +
          (complimentary.expiresAt ? ` until ${formatDate(complimentary.expiresAt)}.` : '.'),
      }

    case 'pending_activation':
      return {
        tone: 'ok',
        text: `${opening}, and their ${months} months of complimentary premium start the first time they sign in.`,
      }

    case 'activating':
      return {
        tone: 'ok',
        text: `${opening}. Their ${months} months of complimentary premium are being set up now — check the invite log.`,
      }

    case 'already_subscribed':
      return {
        tone: 'ok',
        text: `${opening}. They already have a live subscription, so it was left untouched and no complimentary months were added.`,
      }

    case 'not_attempted':
      return {
        tone: 'ok',
        text: `${opening}. Complimentary premium was already scheduled by an earlier invite, so no second grant was created.`,
      }

    case 'failed':
      return {
        tone: 'warn',
        text:
          `${opening}, but their ${months} months of complimentary premium did NOT apply — ` +
          `they will hit the paywall. ${complimentary.error ?? 'No reason was recorded.'} ` +
          `Re-run the grant once it is fixed.`,
      }
  }
}
