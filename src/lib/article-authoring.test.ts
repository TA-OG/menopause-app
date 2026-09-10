import { describe, it, expect } from 'vitest'
import {
  slugify,
  uniqueSlug,
  estimateReadMinutes,
  publicationState,
  checkPublishReadiness,
  slugChangeBreaksLinks,
  createArticleSchema,
  updateArticleSchema,
  publishSchema,
  MIN_PUBLISH_WORDS,
  MAX_TITLE_LENGTH,
} from './article-authoring'

describe('slugify', () => {
  it('turns a title into a URL slug', () => {
    expect(slugify('Understanding hot flushes')).toBe('understanding-hot-flushes')
  })

  it('strips accents rather than dropping the letters', () => {
    // "Ménopause" must not become "mnopause"
    expect(slugify('Ménopause and sleep')).toBe('menopause-and-sleep')
  })

  it('keeps possessives readable', () => {
    expect(slugify("A woman's guide to HRT")).toBe('a-womans-guide-to-hrt')
    expect(slugify('A woman’s guide to HRT')).toBe('a-womans-guide-to-hrt')
  })

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('  HRT: what *actually* helps?  ')).toBe('hrt-what-actually-helps')
  })

  it('never ends in a hyphen even when truncated', () => {
    const slug = slugify('a'.repeat(78) + ' words here')
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.length).toBeLessThanOrEqual(80)
  })

  it('returns an empty string when there is nothing usable', () => {
    expect(slugify('!!! ???')).toBe('')
  })
})

describe('uniqueSlug', () => {
  it('keeps the desired slug when it is free', () => {
    expect(uniqueSlug('sleep', ['hrt'])).toBe('sleep')
  })

  it('suffixes until it finds a free one', () => {
    expect(uniqueSlug('sleep', ['sleep'])).toBe('sleep-2')
    expect(uniqueSlug('sleep', ['sleep', 'sleep-2'])).toBe('sleep-3')
  })

  it('falls back to "article" when slugify produced nothing', () => {
    expect(uniqueSlug('', [])).toBe('article')
  })
})

describe('estimateReadMinutes', () => {
  it('is never zero, even for a one-word article', () => {
    expect(estimateReadMinutes('Hello')).toBe(1)
  })

  it('scales with word count', () => {
    expect(estimateReadMinutes('word '.repeat(400))).toBe(2)
  })

  it('does not count Markdown syntax as words', () => {
    const plain = 'word '.repeat(200)
    const marked = '## Heading\n\n' + '- word\n'.repeat(200)
    // Both are ~200 words of actual prose; the bullets must not inflate it.
    expect(estimateReadMinutes(marked)).toBe(estimateReadMinutes(plain))
  })

  it('ignores fenced code blocks', () => {
    const body = 'word '.repeat(200) + '\n```\n' + 'code '.repeat(400) + '\n```'
    expect(estimateReadMinutes(body)).toBe(1)
  })
})

describe('publicationState', () => {
  const now = new Date('2026-09-10T12:00:00Z')

  it('is draft when there is no date', () => {
    expect(publicationState(null, now)).toBe('draft')
  })

  it('is live when the date has passed', () => {
    expect(publicationState('2026-09-01T00:00:00Z', now)).toBe('live')
  })

  it('is scheduled when the date is in the future', () => {
    // The RLS policy uses published_at <= NOW(), so a future date is not yet
    // readable — the editor must not call it live.
    expect(publicationState('2026-12-01T00:00:00Z', now)).toBe('scheduled')
  })
})

describe('checkPublishReadiness', () => {
  const body = 'word '.repeat(MIN_PUBLISH_WORDS)

  it('passes a complete article', () => {
    const result = checkPublishReadiness({
      title: 'Hot flushes',
      body_md: body,
      category: 'Symptoms',
    })
    expect(result).toEqual({ ready: true, problems: [] })
  })

  it('refuses to publish an empty draft', () => {
    const result = checkPublishReadiness({ title: '', body_md: '', category: '' })
    expect(result.ready).toBe(false)
    expect(result.problems).toHaveLength(3)
  })

  it('reports every problem at once rather than one at a time', () => {
    const result = checkPublishReadiness({ title: '', body_md: body, category: '' })
    expect(result.problems).toHaveLength(2)
  })

  it('counts words, not characters', () => {
    const result = checkPublishReadiness({
      title: 'T',
      body_md: 'a'.repeat(5000),  // one very long word
      category: 'Symptoms',
    })
    expect(result.ready).toBe(false)
  })
})

describe('slugChangeBreaksLinks', () => {
  const now = new Date('2026-09-10T12:00:00Z')

  it('is false when the slug has not changed', () => {
    expect(
      slugChangeBreaksLinks({ slug: 'sleep', published_at: '2026-01-01T00:00:00Z' }, 'sleep', now),
    ).toBe(false)
  })

  it('is true when renaming a live article', () => {
    expect(
      slugChangeBreaksLinks({ slug: 'sleep', published_at: '2026-01-01T00:00:00Z' }, 'rest', now),
    ).toBe(true)
  })

  it('is false for a draft — nobody can have bookmarked it', () => {
    expect(
      slugChangeBreaksLinks({ slug: 'sleep', published_at: null }, 'rest', now),
    ).toBe(false)
  })

  it('is false for a scheduled article that has never been visible', () => {
    expect(
      slugChangeBreaksLinks({ slug: 'sleep', published_at: '2026-12-01T00:00:00Z' }, 'rest', now),
    ).toBe(false)
  })
})

describe('createArticleSchema', () => {
  it('accepts a minimal article and applies defaults', () => {
    const parsed = createArticleSchema.parse({ title: 'Sleep', category: 'Sleep' })
    expect(parsed.tier).toBe('free')
    expect(parsed.body_md).toBe('')
    expect(parsed.tags).toEqual([])
  })

  it('requires a title', () => {
    expect(createArticleSchema.safeParse({ title: '   ', category: 'Sleep' }).success).toBe(false)
  })

  it('requires a category', () => {
    expect(createArticleSchema.safeParse({ title: 'Sleep' }).success).toBe(false)
  })

  it('rejects an over-long title', () => {
    const result = createArticleSchema.safeParse({
      title: 'a'.repeat(MAX_TITLE_LENGTH + 1),
      category: 'Sleep',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a slug that would not work in a URL', () => {
    const result = createArticleSchema.safeParse({
      title: 'Sleep',
      category: 'Sleep',
      slug: 'Not A Slug',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown tier', () => {
    const result = createArticleSchema.safeParse({
      title: 'Sleep',
      category: 'Sleep',
      tier: 'vip',
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than ten tags', () => {
    const result = createArticleSchema.safeParse({
      title: 'Sleep',
      category: 'Sleep',
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    })
    expect(result.success).toBe(false)
  })
})

describe('updateArticleSchema', () => {
  it('allows a partial update without blanking untouched fields', () => {
    const parsed = updateArticleSchema.parse({ title: 'New title' })
    expect(parsed).toEqual({ title: 'New title' })
    expect('body_md' in parsed).toBe(false)
  })

  it('still validates the fields it is given', () => {
    expect(updateArticleSchema.safeParse({ slug: 'Bad Slug' }).success).toBe(false)
  })

  it('does not accept published_at — publishing has its own endpoint', () => {
    const parsed = updateArticleSchema.parse({
      title: 'T',
      published_at: '2026-01-01T00:00:00Z',
    } as Record<string, unknown>)
    expect('published_at' in parsed).toBe(false)
  })
})

describe('publishSchema', () => {
  it('accepts publish and unpublish', () => {
    expect(publishSchema.parse({ action: 'publish' }).action).toBe('publish')
    expect(publishSchema.parse({ action: 'unpublish' }).action).toBe('unpublish')
  })

  it('accepts a future date for scheduling', () => {
    const parsed = publishSchema.parse({
      action: 'publish',
      publish_at: '2026-12-01T00:00:00Z',
    })
    expect(parsed.publish_at).toBe('2026-12-01T00:00:00Z')
  })

  it('rejects an unknown action', () => {
    expect(publishSchema.safeParse({ action: 'delete' }).success).toBe(false)
  })

  it('rejects a malformed date', () => {
    expect(publishSchema.safeParse({ action: 'publish', publish_at: 'tomorrow' }).success).toBe(false)
  })
})
