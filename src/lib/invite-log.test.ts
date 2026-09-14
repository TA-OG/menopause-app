import { describe, it, expect } from 'vitest'
import { collapseInvitesByPerson, summariseInvites, type InviteLogRow } from '@/lib/invite-log'

function row(over: Partial<InviteLogRow> = {}): InviteLogRow {
  return {
    email: 'jo@example.com',
    email_status: 'invite_sent',
    complimentary_status: 'pending_activation',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('collapseInvitesByPerson', () => {
  it('treats one person with several attempts as one person', () => {
    const people = collapseInvitesByPerson([row(), row({ created_at: '2026-02-01T00:00:00.000Z' })])
    expect(people).toHaveLength(1)
  })

  it('matches the same person across differing email case', () => {
    const people = collapseInvitesByPerson([
      row({ email: 'Jo@Example.com' }),
      row({ email: 'jo@example.com' }),
    ])
    expect(people).toHaveLength(1)
  })

  it('takes the email outcome from the most recent attempt', () => {
    const people = collapseInvitesByPerson([
      row({ email_status: 'not_sent', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ email_status: 'magic_link_sent', created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(people[0].emailStatus).toBe('magic_link_sent')
  })

  it('does not depend on the order rows arrive in', () => {
    const newest = row({ email_status: 'magic_link_sent', created_at: '2026-03-01T00:00:00.000Z' })
    const oldest = row({ email_status: 'not_sent', created_at: '2026-01-01T00:00:00.000Z' })

    expect(collapseInvitesByPerson([newest, oldest])[0].emailStatus).toBe('magic_link_sent')
    expect(collapseInvitesByPerson([oldest, newest])[0].emailStatus).toBe('magic_link_sent')
  })

  it('keeps a successful grant when a later resend records not_attempted', () => {
    // The resend no-ops the grant precisely BECAUSE she already has her
    // months. Reading the latest row alone would report that as "no premium".
    const people = collapseInvitesByPerson([
      row({ complimentary_status: 'pending_activation', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ complimentary_status: 'not_attempted', created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(people[0].complimentaryStatus).toBe('pending_activation')
  })

  it('lets a later success clear an earlier failed grant', () => {
    const people = collapseInvitesByPerson([
      row({ complimentary_status: 'failed', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ complimentary_status: 'granted', created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(people[0].complimentaryStatus).toBe('granted')
  })

  it('does not let an unparseable timestamp win as most recent', () => {
    const people = collapseInvitesByPerson([
      row({ email_status: 'magic_link_sent', created_at: '2026-03-01T00:00:00.000Z' }),
      row({ email_status: 'not_sent', created_at: 'not a date' }),
    ])
    expect(people[0].emailStatus).toBe('magic_link_sent')
  })

  it('keeps genuinely different people apart', () => {
    const people = collapseInvitesByPerson([
      row({ email: 'jo@example.com' }),
      row({ email: 'pat@example.com' }),
    ])
    expect(people).toHaveLength(2)
  })
})

describe('summariseInvites', () => {
  it('counts people, not attempts', () => {
    const summary = summariseInvites([
      row({ created_at: '2026-01-01T00:00:00.000Z' }),
      row({ created_at: '2026-02-01T00:00:00.000Z' }),
      row({ created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(summary.total).toBe(1)
  })

  it('stops counting someone as never emailed once a resend reaches her', () => {
    const before = summariseInvites([
      row({ email_status: 'not_sent', created_at: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(before.noEmail).toBe(1)

    const after = summariseInvites([
      row({ email_status: 'not_sent', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ email_status: 'magic_link_sent', created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(after.noEmail).toBe(0)
  })

  it('still reports someone whose resend also failed', () => {
    const summary = summariseInvites([
      row({ email_status: 'not_sent', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ email_status: 'not_sent', created_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(summary.noEmail).toBe(1)
  })

  it('keeps a resent person in awaiting sign-in rather than losing her', () => {
    const summary = summariseInvites([
      row({
        email_status: 'not_sent',
        complimentary_status: 'pending_activation',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
      row({
        email_status: 'magic_link_sent',
        complimentary_status: 'not_attempted',
        created_at: '2026-03-01T00:00:00.000Z',
      }),
    ])
    expect(summary.awaitingSignIn).toBe(1)
    expect(summary.noEmail).toBe(0)
    expect(summary.total).toBe(1)
  })

  it('counts each outcome once across a mixed log', () => {
    const summary = summariseInvites([
      row({ email: 'a@example.com', complimentary_status: 'granted' }),
      row({ email: 'b@example.com', complimentary_status: 'pending_activation' }),
      row({ email: 'c@example.com', complimentary_status: 'already_subscribed' }),
      row({ email: 'd@example.com', complimentary_status: 'failed', email_status: 'not_sent' }),
    ])

    expect(summary).toEqual({
      total: 4,
      granted: 1,
      awaitingSignIn: 1,
      alreadySubscribed: 1,
      failed: 1,
      noEmail: 1,
    })
  })

  it('reports nothing outstanding for an empty log', () => {
    expect(summariseInvites([])).toEqual({
      total: 0,
      granted: 0,
      awaitingSignIn: 0,
      alreadySubscribed: 0,
      failed: 0,
      noEmail: 0,
    })
  })
})
