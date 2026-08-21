import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  splitFrontmatter,
  validatePostFrontmatter,
  loadPostsFrom,
  getAllPosts,
} from './blog'

/** Minimal frontmatter that passes validation, so each test can break one thing. */
const VALID_FRONTMATTER = {
  slug: 'a-post',
  title: 'A post',
  description: 'A description.',
  publishedAt: '2026-08-21',
  author: 'The Aunty Mel team',
  category: 'Menopause news',
  readMinutes: 5,
  keywords: ['menopause'],
  sources: [
    {
      title: 'Some source',
      publisher: 'Some publisher',
      url: 'https://example.org/thing',
      accessed: '2026-08',
    },
  ],
}

function withFrontmatter(overrides: Record<string, unknown>) {
  return { ...VALID_FRONTMATTER, ...overrides }
}

function writeTempPost(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

function toFile(frontmatter: Record<string, unknown>, body = 'Body text.'): string {
  const yamlLines = Object.entries(frontmatter).map(
    ([k, v]) => `${k}: ${JSON.stringify(v)}`
  )
  return `---\n${yamlLines.join('\n')}\n---\n\n${body}\n`
}

describe('splitFrontmatter', () => {
  it('separates the frontmatter mapping from the body', () => {
    const result = splitFrontmatter('---\ntitle: Hi\n---\n\nBody here.\n')
    expect(result).not.toBeNull()
    expect(result!.frontmatter).toEqual({ title: 'Hi' })
    expect(result!.body).toBe('Body here.')
  })

  it('returns null when there is no frontmatter block', () => {
    expect(splitFrontmatter('# Just markdown\n')).toBeNull()
  })

  it('does not treat a --- rule inside the body as a delimiter', () => {
    const result = splitFrontmatter('---\ntitle: Hi\n---\n\nOne\n\n---\n\nTwo\n')
    expect(result!.frontmatter).toEqual({ title: 'Hi' })
    expect(result!.body).toContain('One')
    expect(result!.body).toContain('Two')
  })
})

describe('validatePostFrontmatter', () => {
  it('accepts a well-formed post', () => {
    expect(validatePostFrontmatter('a-post.md', VALID_FRONTMATTER)).toEqual([])
  })

  it('rejects a slug that does not match the filename', () => {
    // The slug is the canonical URL — drift between it and the filename means
    // the sitemap and the route can disagree about where the post lives.
    const errors = validatePostFrontmatter('different-name.md', VALID_FRONTMATTER)
    expect(errors.join(' ')).toContain('does not match filename')
  })

  it.each(['title', 'description', 'publishedAt', 'author', 'category'])(
    'requires %s',
    (field) => {
      const fm = withFrontmatter({ [field]: undefined })
      expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain(field)
    }
  )

  it('rejects a description over 160 characters', () => {
    const fm = withFrontmatter({ description: 'x'.repeat(161) })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('161 chars')
  })

  it('accepts a description of exactly 160 characters', () => {
    const fm = withFrontmatter({ description: 'x'.repeat(160) })
    expect(validatePostFrontmatter('a-post.md', fm)).toEqual([])
  })

  it('rejects a non-ISO publishedAt', () => {
    const fm = withFrontmatter({ publishedAt: '21 August 2026' })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('ISO date')
  })

  it('rejects a non-positive readMinutes', () => {
    const fm = withFrontmatter({ readMinutes: 0 })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('readMinutes')
  })

  // The whole reason this validator exists: a health post that asserts facts
  // about a named person or a treatment must carry checkable citations.
  it('rejects a post with no sources', () => {
    const fm = withFrontmatter({ sources: [] })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('at least one citation')
  })

  it('rejects a source missing its publisher', () => {
    const fm = withFrontmatter({
      sources: [{ title: 'T', url: 'https://example.org', accessed: '2026-08' }],
    })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('every source needs')
  })

  it('rejects a non-https source url', () => {
    const fm = withFrontmatter({
      sources: [
        { title: 'T', publisher: 'P', url: 'http://example.org', accessed: '2026-08' },
      ],
    })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('https URL')
  })

  it('rejects a malformed accessed date', () => {
    const fm = withFrontmatter({
      sources: [
        { title: 'T', publisher: 'P', url: 'https://example.org', accessed: 'August 2026' },
      ],
    })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('YYYY-MM')
  })

  it('rejects frontmatter that is not a mapping', () => {
    expect(validatePostFrontmatter('a-post.md', ['nope']).join(' ')).toContain(
      'not a YAML mapping'
    )
  })

  it('rejects malformed faqs', () => {
    const fm = withFrontmatter({ faqs: [{ question: 'Q' }] })
    expect(validatePostFrontmatter('a-post.md', fm).join(' ')).toContain('faqs')
  })
})

describe('loadPostsFrom', () => {
  it('returns an empty list when the directory does not exist', () => {
    expect(loadPostsFrom('/definitely/not/a/real/dir')).toEqual([])
  })

  it('throws rather than silently skipping an invalid post', () => {
    // A dropped post is a 404 in production with a green build — worse than a red one.
    const dir = writeTempPost({ 'a-post.md': toFile(withFrontmatter({ sources: [] })) })
    expect(() => loadPostsFrom(dir)).toThrow(/at least one citation/)
  })

  it('throws when a file has no frontmatter', () => {
    const dir = writeTempPost({ 'a-post.md': '# No frontmatter\n' })
    expect(() => loadPostsFrom(dir)).toThrow(/no YAML frontmatter/)
  })

  it('throws when the body is empty', () => {
    const dir = writeTempPost({ 'a-post.md': toFile(VALID_FRONTMATTER, '') })
    expect(() => loadPostsFrom(dir)).toThrow(/body is empty/)
  })

  it('reports every defect in one pass, not just the first', () => {
    const dir = writeTempPost({
      'a-post.md': toFile(withFrontmatter({ sources: [], readMinutes: 0 })),
    })
    expect(() => loadPostsFrom(dir)).toThrow(/citation[\s\S]*readMinutes|readMinutes[\s\S]*citation/)
  })

  it('sorts posts newest first', () => {
    const dir = writeTempPost({
      'older.md': toFile(withFrontmatter({ slug: 'older', publishedAt: '2026-01-01' })),
      'newer.md': toFile(withFrontmatter({ slug: 'newer', publishedAt: '2026-08-01' })),
    })
    expect(loadPostsFrom(dir).map((p) => p.slug)).toEqual(['newer', 'older'])
  })

  it('defaults faqs to an empty list when absent', () => {
    const dir = writeTempPost({ 'a-post.md': toFile(VALID_FRONTMATTER) })
    expect(loadPostsFrom(dir)[0].faqs).toEqual([])
  })

  it('ignores non-markdown files', () => {
    const dir = writeTempPost({
      'a-post.md': toFile(VALID_FRONTMATTER),
      'notes.txt': 'not a post',
    })
    expect(loadPostsFrom(dir)).toHaveLength(1)
  })
})

/**
 * Find "stop your HRT"-style advice that is NOT negated.
 *
 * Negation is only ever looked for BEHIND the match, within the same sentence.
 * An earlier attempt also scanned forward, and "come off HRT and try this instead
 * of a GP" slipped through because "instead of" sat in the forward window — a
 * guardrail that excuses the exact sentence it exists to catch.
 *
 * The gerund form needs no special handling: \bstop\b does not match "stopping",
 * so "stopping HRT abruptly is a bad plan" never matches in the first place.
 */
const STOP_ADVICE_RE =
  /\b(stop|quit|come off|ditch)\s+(?:taking\s+)?(?:your\s+)?(hrt|hormones|medication|treatment)\b/gi

const NEGATORS = /\b(not|never|don'?t|cannot|can'?t|shouldn'?t|isn'?t)\b/i

export function findUnnegatedStopAdvice(text: string): string | null {
  // exec-loop rather than matchAll: the project targets a tsconfig lib below
  // es2015 iteration, and this is not the place to change that.
  STOP_ADVICE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = STOP_ADVICE_RE.exec(text)) !== null) {
    const start = match.index ?? 0
    const before = text.slice(Math.max(0, start - 80), start)
    // Only consider the current sentence — a negation two sentences back does
    // not neutralise this one.
    const sentenceStart = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('\n'),
      before.lastIndexOf('?'),
      before.lastIndexOf('!')
    )
    if (!NEGATORS.test(before.slice(sentenceStart + 1))) return match[0]
  }
  return null
}

describe('findUnnegatedStopAdvice', () => {
  it.each([
    'You should stop your HRT today',
    'just ditch HRT entirely',
    'come off HRT and try this instead of a GP',
    'quit taking your medication',
  ])('flags %j', (text) => {
    expect(findUnnegatedStopAdvice(text)).not.toBeNull()
  })

  it.each([
    'Stopping HRT abruptly because of a news story is a bad plan',
    'do not stop your HRT because of a news story',
    "don't stop your medication without talking to your GP",
    'This is not a reason to stop your HRT',
    'Talk to your prescriber about your dose',
  ])('allows the safe phrasing %j', (text) => {
    expect(findUnnegatedStopAdvice(text)).toBeNull()
  })

  it('scans past an early negated match to find a later real one', () => {
    const text = 'Do not stop your HRT. But honestly, just ditch HRT anyway.'
    expect(findUnnegatedStopAdvice(text)).not.toBeNull()
  })
})

describe('the real content directory', () => {
  const posts = getAllPosts()

  it('parses every shipped post', () => {
    expect(posts.length).toBeGreaterThan(0)
  })

  it('gives every shipped post at least one checkable source', () => {
    for (const post of posts) {
      expect(post.sources.length, `${post.slug} has no sources`).toBeGreaterThan(0)
    }
  })

  it('uses unique slugs across all shipped posts', () => {
    const slugs = posts.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  // Safety guardrail, matching the rule the wellness frameworks live under: a
  // public post must never tell a woman to stop or change a prescribed treatment.
  it('never instructs a reader to stop their medication', () => {
    for (const post of posts) {
      const offending = findUnnegatedStopAdvice(post.body)
      expect(offending, `${post.slug} tells readers to stop HRT: "${offending}"`).toBeNull()
    }
  })
})
