import { describe, it, expect } from 'vitest'
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_DESCRIPTIONS,
  isReviewStatus,
  isReviewAction,
  resolveTransition,
  isLive,
  publishedAtAfterApproval,
  editRevokesApproval,
  sortForReview,
  reviewedContentOf,
  type ReviewStatus,
} from './article-review'

describe('review states', () => {
  it('covers every state with a label and a description', () => {
    expect(REVIEW_STATUSES).toHaveLength(4)
    for (const status of REVIEW_STATUSES) {
      expect(REVIEW_STATUS_LABELS[status]?.length).toBeGreaterThan(0)
      expect(REVIEW_STATUS_DESCRIPTIONS[status]?.length).toBeGreaterThan(0)
    }
  })

  it('recognises valid states and rejects anything else', () => {
    expect(isReviewStatus('approved')).toBe(true)
    expect(isReviewStatus('in_review')).toBe(true)
    expect(isReviewStatus('published')).toBe(false)
    expect(isReviewStatus('')).toBe(false)
    expect(isReviewStatus(null)).toBe(false)
    expect(isReviewStatus(undefined)).toBe(false)
    expect(isReviewStatus(1)).toBe(false)
  })

  it('recognises valid actions and rejects anything else', () => {
    expect(isReviewAction('approve')).toBe(true)
    expect(isReviewAction('request_changes')).toBe(true)
    expect(isReviewAction('publish')).toBe(false)
    expect(isReviewAction('delete')).toBe(false)
    expect(isReviewAction(null)).toBe(false)
  })
})

describe('resolveTransition — approving', () => {
  it('approves an article that is waiting for review', () => {
    const result = resolveTransition({ from: 'in_review', action: 'approve' })
    expect(result).toEqual({ ok: true, to: 'approved', note: null })
  })

  it('approves an article that was sent back and rewritten', () => {
    const result = resolveTransition({ from: 'changes_requested', action: 'approve' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.to).toBe('approved')
  })

  it('keeps an optional note when approving', () => {
    const result = resolveTransition({
      from: 'in_review',
      action: 'approve',
      note: '  Happy with this — the dose caveat is right.  ',
    })
    expect(result).toEqual({
      ok: true,
      to: 'approved',
      note: 'Happy with this — the dose caveat is right.',
    })
  })

  it('refuses to approve an unfinished draft', () => {
    const result = resolveTransition({ from: 'draft', action: 'approve' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('cannot be approved')
  })

  it('refuses to approve something already approved', () => {
    const result = resolveTransition({ from: 'approved', action: 'approve' })
    expect(result.ok).toBe(false)
  })
})

describe('resolveTransition — sending back', () => {
  it('sends an article back with a reason', () => {
    const result = resolveTransition({
      from: 'in_review',
      action: 'request_changes',
      note: 'The magnesium dose is not in my source — please take the number out.',
    })
    expect(result).toEqual({
      ok: true,
      to: 'changes_requested',
      note: 'The magnesium dose is not in my source — please take the number out.',
    })
  })

  it('lets a reviewer pull back an article she already approved', () => {
    const result = resolveTransition({
      from: 'approved',
      action: 'request_changes',
      note: 'Second thoughts on the sleep claim.',
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.to).toBe('changes_requested')
  })

  it('refuses to send an article back without saying why', () => {
    for (const note of [undefined, null, '', '   ', '\n\t ']) {
      const result = resolveTransition({ from: 'in_review', action: 'request_changes', note })
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error).toContain('what needs changing')
    }
  })

  it('refuses to send back a draft that is not in front of the reviewer yet', () => {
    const result = resolveTransition({
      from: 'draft',
      action: 'request_changes',
      note: 'Not ready.',
    })
    expect(result.ok).toBe(false)
  })
})

describe('isLive', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')

  it('is live only when approved and published in the past', () => {
    expect(
      isLive({ review_status: 'approved', published_at: '2026-09-01T00:00:00.000Z' }, now),
    ).toBe(true)
  })

  it('is not live for any unapproved state, however it is published', () => {
    const unapproved: ReviewStatus[] = ['draft', 'in_review', 'changes_requested']
    for (const review_status of unapproved) {
      expect(isLive({ review_status, published_at: '2020-01-01T00:00:00.000Z' }, now)).toBe(false)
    }
  })

  it('is not live when approved but never published', () => {
    expect(isLive({ review_status: 'approved', published_at: null }, now)).toBe(false)
  })

  it('is not live when the publish date is still in the future', () => {
    expect(
      isLive({ review_status: 'approved', published_at: '2026-12-25T00:00:00.000Z' }, now),
    ).toBe(false)
  })

  it('treats an unparseable publish date as not live rather than live', () => {
    expect(isLive({ review_status: 'approved', published_at: 'not a date' }, now)).toBe(false)
  })
})

describe('publishedAtAfterApproval', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')

  it('dates a never-published article from the approval', () => {
    expect(publishedAtAfterApproval(null, now)).toBe('2026-09-07T12:00:00.000Z')
  })

  it('preserves the original publication date on re-approval after an edit', () => {
    expect(publishedAtAfterApproval('2026-01-04T09:30:00.000Z', now)).toBe(
      '2026-01-04T09:30:00.000Z',
    )
  })
})

describe('editRevokesApproval', () => {
  const before = { title: 'Sleeping through the night', body_md: 'Some women find…' }

  it('revokes when the body changes', () => {
    expect(editRevokesApproval(before, { ...before, body_md: 'Take 400mg of…' })).toBe(true)
  })

  it('revokes when the title changes', () => {
    expect(editRevokesApproval(before, { ...before, title: 'Sleep better tonight' })).toBe(true)
  })

  it('revokes on a change as small as a single word', () => {
    expect(
      editRevokesApproval(
        { title: 'T', body_md: 'Some women find it helps.' },
        { title: 'T', body_md: 'Most women find it helps.' },
      ),
    ).toBe(true)
  })

  it('does not revoke when nothing a woman reads has changed', () => {
    expect(editRevokesApproval(before, { ...before })).toBe(false)
  })

  it('reduces an article to just the reviewed fields', () => {
    const full = { ...before, tier: 'premium', category: 'sleep', tags: ['sleep'] }
    expect(reviewedContentOf(full)).toEqual(before)
  })
})

describe('sortForReview', () => {
  const article = (
    title: string,
    review_status: ReviewStatus,
    updated_at: string,
  ) => ({ title, review_status, updated_at, published_at: null })

  it('puts what needs the reviewer first, oldest first within a group', () => {
    const sorted = sortForReview([
      article('Approved one', 'approved', '2026-09-06T00:00:00.000Z'),
      article('Newer waiting', 'in_review', '2026-09-05T00:00:00.000Z'),
      article('Still drafting', 'draft', '2026-09-01T00:00:00.000Z'),
      article('Older waiting', 'in_review', '2026-08-01T00:00:00.000Z'),
      article('Sent back', 'changes_requested', '2026-09-04T00:00:00.000Z'),
    ])

    expect(sorted.map((a) => a.title)).toEqual([
      'Older waiting',
      'Newer waiting',
      'Sent back',
      'Approved one',
      'Still drafting',
    ])
  })

  it('does not mutate the array it was given', () => {
    const input = [
      article('B', 'approved', '2026-09-01T00:00:00.000Z'),
      article('A', 'in_review', '2026-09-02T00:00:00.000Z'),
    ]
    const copy = [...input]
    sortForReview(input)
    expect(input).toEqual(copy)
  })

  it('falls back to title for articles updated at the same moment', () => {
    const sorted = sortForReview([
      article('Zinc', 'in_review', '2026-09-01T00:00:00.000Z'),
      article('Ashwagandha', 'in_review', '2026-09-01T00:00:00.000Z'),
    ])
    expect(sorted.map((a) => a.title)).toEqual(['Ashwagandha', 'Zinc'])
  })

  it('sorts rows with an unreadable timestamp last instead of scrambling the order', () => {
    const sorted = sortForReview([
      article('Broken', 'in_review', 'nonsense'),
      article('Fine', 'in_review', '2026-09-01T00:00:00.000Z'),
    ])
    expect(sorted.map((a) => a.title)).toEqual(['Fine', 'Broken'])
  })
})
