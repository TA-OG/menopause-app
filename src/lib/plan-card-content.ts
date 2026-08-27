/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COLLAPSES, AND WHAT NEVER DOES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A full plan runs to 105+ cards and ~10,000 words. Read end to end on a phone
 * that is roughly 45 minutes, and the women this is for are, by the app's own
 * content, dealing with brain fog, broken sleep and low patience. So the cards
 * collapse.
 *
 * Collapsing health content is exactly where a redesign can do harm, so the
 * decision about which half of a card is behind the fold is made HERE, as a
 * pure function, rather than implicitly by the order of JSX in a component.
 * That makes the rule testable without a DOM, and makes a regression visible in
 * a unit test rather than in production.
 *
 *   ALWAYS VISIBLE — cannot be collapsed, ever
 *     title            she needs to know what the card is
 *     personal_note    "you told us you take blood thinners…" — the reason
 *                      this card reads differently for her than for anyone else
 *     max_daily_note   the cumulative dose ceiling; the visible half of the
 *                      dose-stacking guarantee that substances.yaml and
 *                      wellness-engine.safety.test.ts exist to enforce
 *     disclaimer       the GP-check that validateFrameworks() requires on every
 *                      supplement
 *
 *   COLLAPSIBLE — the long-form explanation
 *     body             median 61 words, up to 281
 *     also_for         why the card was suggested more than once
 *
 * The cost is honest: a supplement card still shows its disclaimer while
 * collapsed, so the supplements tab is not as short as it could be. That is the
 * right trade. The body is the bulk of the length and it is the part that can
 * wait; a caution she has to tap to discover is a caution that does not exist.
 *
 * ON VISUAL CLAMPING RATHER THAN REMOVAL
 * The component renders the collapsed body clamped with CSS, not stripped from
 * the DOM. A screen reader still reaches every word without expanding anything.
 * Hiding health content from assistive tech to save scroll for sighted users
 * would be the wrong trade in this app specifically.
 */

import type { WellnessRecommendation } from '@/types/database'

/** One piece of always-visible safety copy, and how to render it. */
export interface SafetyLine {
  /**
   * 'personal'  — drawn from her own intake answers (medical flag, restriction)
   * 'ceiling'   — cumulative maximum daily dose for this substance
   * 'gp_check'  — the authored disclaimer
   */
  kind: 'personal' | 'ceiling' | 'gp_check'
  text: string
}

export interface PlanCardContent {
  title: string
  priority: WellnessRecommendation['priority']
  /**
   * Safety copy, in the order it must appear — most personal first. Never
   * behind a "read more".
   */
  safetyLines: SafetyLine[]
  /** The long-form explanation. Clamped when collapsed. */
  body: string
  /** Other reasons this substance was suggested. Collapsible. */
  alsoFor: string[]
  /** True when there is anything to expand — otherwise no toggle is rendered. */
  isExpandable: boolean
}

/**
 * Split a recommendation into the part that must always be on screen and the
 * part that may be collapsed.
 *
 * Pure and total: a recommendation with no disclaimer, no note and no ceiling
 * simply yields no safety lines.
 */
export function planCardContent(
  rec: WellnessRecommendation
): PlanCardContent {
  const safetyLines: SafetyLine[] = []

  // Order matters. Her own declared circumstance leads, because it is the one
  // piece of this card written about her rather than about the substance.
  if (rec.personal_note?.text?.trim()) {
    safetyLines.push({ kind: 'personal', text: rec.personal_note.text.trim() })
  }
  if (rec.max_daily_note?.trim()) {
    safetyLines.push({ kind: 'ceiling', text: rec.max_daily_note.trim() })
  }
  if (rec.disclaimer?.trim()) {
    safetyLines.push({ kind: 'gp_check', text: rec.disclaimer.trim() })
  }

  const body = (rec.body ?? '').trim()
  const alsoFor = (rec.also_for ?? []).filter((t) => t?.trim())

  return {
    title: rec.title,
    priority: rec.priority,
    safetyLines,
    body,
    alsoFor,
    // Short cards get no toggle — a "read more" that reveals one extra line is
    // an interaction for nothing.
    isExpandable: body.length > BODY_PREVIEW_CHARS || alsoFor.length > 0,
  }
}

/**
 * Roughly how much body text survives the CSS clamp at typical phone widths
 * (3 lines at ~16px). Used only to decide whether a toggle is worth rendering —
 * the actual truncation is done by CSS, which knows the real width.
 */
export const BODY_PREVIEW_CHARS = 150

/**
 * Every field that carries safety-critical copy.
 *
 * Exported so the test can assert the split is EXHAUSTIVE — that no such field
 * has been added to WellnessRecommendation and then quietly left out of
 * `safetyLines`, where it would end up collapsible by default.
 */
export const SAFETY_CRITICAL_FIELDS = [
  'personal_note',
  'max_daily_note',
  'disclaimer',
] as const
