import type { WellnessPlan, WellnessRecommendation } from '@/types/database'

/**
 * Pure helpers for the plan-drip cron (src/app/api/cron/notifications/route.ts).
 * Extracted so the local-time and rotation logic — the two places a bug would
 * either send at the wrong hour or repeat/skip plan items — are testable
 * without a database or a webpush client, matching how wellness-engine.ts
 * keeps the plan-building logic pure and separate from its API route.
 */

export interface LocalMoment {
  hour: number
  /** YYYY-MM-DD in the target timezone, used for once-per-day idempotency. */
  date: string
}

/**
 * The current local hour (0-23) and calendar date in the given IANA timezone,
 * or null if the timezone is missing or invalid.
 *
 * Callers MUST treat null as "cannot localise" and skip — never fall back to
 * UTC, which could fire a reminder at 3am for someone whose timezone simply
 * hasn't been captured yet.
 */
export function localHourAndDate(timezone: string | null | undefined): LocalMoment | null {
  if (!timezone) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(new Date())
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const hour = Number(get('hour'))
    const date = `${get('year')}-${get('month')}-${get('day')}`
    if (Number.isNaN(hour)) return null
    return { hour, date }
  } catch {
    // Invalid IANA timezone string (Intl throws RangeError)
    return null
  }
}

const MAX_BODY_LENGTH = 160

export function truncate(text: string, max: number = MAX_BODY_LENGTH): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/**
 * Every recommendation in a (tier-gated) plan, combined across categories,
 * in the order buildPlan/applyTierGating already produced. Individual
 * category arrays are already deduplicated by buildPlan; this just merges
 * them for rotation across the whole plan rather than per-category.
 */
export function flattenPlan(
  plan: Pick<
    WellnessPlan,
    'diet_adjustments' | 'lifestyle_adjustments' | 'mindset_recommendations' | 'supplement_suggestions'
  >
): WellnessRecommendation[] {
  return [
    ...plan.diet_adjustments,
    ...plan.lifestyle_adjustments,
    ...plan.mindset_recommendations,
    ...plan.supplement_suggestions,
  ]
}

/**
 * Pick the next recommendation to surface: the one least recently sent to
 * this user. A recommendation with no history (never sent) sorts before any
 * with a timestamp, since an empty string is lexicographically smaller than
 * any ISO 8601 date — so new plan items are surfaced before the rotation
 * repeats, and the cycle only starts repeating once everything currently in
 * the plan has been sent at least once.
 */
export function pickNext(
  recs: WellnessRecommendation[],
  lastSentAt: Map<string, string>
): WellnessRecommendation | null {
  if (recs.length === 0) return null
  let best = recs[0]
  let bestTime = lastSentAt.get(best.id) ?? ''
  for (const rec of recs.slice(1)) {
    const time = lastSentAt.get(rec.id) ?? ''
    if (time < bestTime) {
      best = rec
      bestTime = time
    }
  }
  return best
}
