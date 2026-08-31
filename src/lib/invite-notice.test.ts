import { describe, it, expect } from 'vitest'
import { overrideGrantNotice } from './invite-notice'
import type { OverrideGrantOutcome } from './invite-notice'

const base: OverrideGrantOutcome = {
  email: 'tester@example.com',
  invited: true,
  alreadyRegistered: false,
  complimentary: {
    status: 'pending_activation',
    months: 12,
    expiresAt: null,
    error: null,
  },
}

describe('overrideGrantNotice', () => {
  it('says an invite was emailed and when the months start', () => {
    const notice = overrideGrantNotice(base)

    expect(notice.tone).toBe('ok')
    expect(notice.text).toContain('Invite emailed to tester@example.com')
    expect(notice.text).toContain('12 months')
    expect(notice.text).toContain('first time they sign in')
  })

  it('distinguishes a sign-in link to an existing account from a fresh invite', () => {
    const notice = overrideGrantNotice({
      ...base,
      invited: false,
      alreadyRegistered: true,
      emailDelivery: { status: 'magic_link_sent', failed: false, error: null },
    })

    expect(notice.text).toContain('already had an account')
    expect(notice.text).toContain('sign-in link')
    expect(notice.text).not.toContain('Invite emailed')
  })

  it('leads with the email failure, ahead of everything that did work', () => {
    // The regression this guards: an override plus twelve months of premium
    // reported as a success, to someone who was never emailed and therefore
    // has no idea any of it happened.
    const notice = overrideGrantNotice({
      ...base,
      invited: false,
      alreadyRegistered: true,
      emailDelivery: {
        status: 'not_sent',
        failed: true,
        error: 'Resend rejected the send: domain is not verified.',
      },
      complimentary: { status: 'granted', months: 12, expiresAt: null, error: null },
    })

    expect(notice.tone).toBe('warn')
    expect(notice.text).toContain('NO email reached them')
    expect(notice.text).toContain('domain is not verified')
    // Must not read as a success just because the premium landed.
    expect(notice.text).not.toContain('They have full access')
  })

  it('reports a granted period with its end date', () => {
    const notice = overrideGrantNotice({
      ...base,
      invited: false,
      alreadyRegistered: true,
      complimentary: {
        status: 'granted',
        months: 12,
        expiresAt: '2027-08-28T00:00:00.000Z',
        error: null,
      },
    })

    expect(notice.tone).toBe('ok')
    expect(notice.text).toContain('12 months of complimentary premium')
    expect(notice.text).toContain('2027')
  })

  it('warns loudly, with the reason, when premium did not apply', () => {
    // An admin who is told the grant succeeded will not follow it up, and the
    // woman on the other end hits a paywall she was promised she would not.
    const notice = overrideGrantNotice({
      ...base,
      complimentary: {
        status: 'failed',
        months: 12,
        expiresAt: null,
        error: 'Stripe is down',
      },
    })

    expect(notice.tone).toBe('warn')
    expect(notice.text).toContain('did NOT apply')
    expect(notice.text).toContain('Stripe is down')
    expect(notice.text).toContain('paywall')
  })

  it('still warns when a failure recorded no reason', () => {
    const notice = overrideGrantNotice({
      ...base,
      complimentary: { status: 'failed', months: 12, expiresAt: null, error: null },
    })

    expect(notice.tone).toBe('warn')
    expect(notice.text).toContain('No reason was recorded')
  })

  it('says a live subscription was left untouched', () => {
    const notice = overrideGrantNotice({
      ...base,
      invited: false,
      alreadyRegistered: true,
      complimentary: {
        status: 'already_subscribed',
        months: 12,
        expiresAt: null,
        error: null,
      },
    })

    expect(notice.tone).toBe('ok')
    expect(notice.text).toContain('left untouched')
    // Must never imply months were added on top of what they pay for.
    expect(notice.text).not.toContain('start the first time')
  })

  it('explains when an earlier invite already scheduled the months', () => {
    const notice = overrideGrantNotice({
      ...base,
      complimentary: {
        status: 'not_attempted',
        months: 12,
        expiresAt: null,
        error: null,
      },
    })

    expect(notice.tone).toBe('ok')
    expect(notice.text).toContain('already scheduled by an earlier invite')
  })

  it('covers the transient activating state', () => {
    const notice = overrideGrantNotice({
      ...base,
      complimentary: { status: 'activating', months: 12, expiresAt: null, error: null },
    })

    expect(notice.tone).toBe('ok')
    expect(notice.text).toContain('being set up')
  })
})
