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
 *     helpsWith        the symptoms this one card covers — the headline of a
 *                      merged card, and the reason it can replace five
 *     personal_note    "you told us you take blood thinners…" — the reason
 *                      this card reads differently for her than for anyone else
 *     max_daily_note   the cumulative dose ceiling; the visible half of the
 *                      dose-stacking guarantee that substances.yaml and
 *                      wellness-engine.safety.test.ts exist to enforce
 *     disclaimer       the GP-check that validateFrameworks() requires on every
 *                      supplement
 *     additional_      the OTHER cards' GP-checks, when several frameworks were
 *       disclaimers    merged into this one. Same status as `disclaimer`: a
 *                      caution does not become optional because the card it was
 *                      written on lost a tie-break.
 *
 *   COLLAPSIBLE — the long-form explanation
 *     body             median 61 words, up to 281
 *     also_for         what the other frameworks said about this substance,
 *                      each with its authored body intact
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

import type { MergedBenefit, WellnessRecommendation } from '@/types/database'
import { SYMPTOM_CHOICES } from './onboarding-config'

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

/** A symptom this card addresses, in the words onboarding used to ask about it. */
export interface HelpsWith {
  value: string
  label: string
}

export interface PlanCardContent {
  title: string
  priority: WellnessRecommendation['priority']
  /**
   * The symptoms this card covers, always visible. On a merged card this is the
   * union across every framework that suggested the substance — it is what lets
   * one magnesium card do the job of five without the reader having to open it
   * to find out whether hers is in there.
   */
  helpsWith: HelpsWith[]
  /**
   * Safety copy, in the order it must appear — most personal first. Never
   * behind a "read more".
   */
  safetyLines: SafetyLine[]
  /** The long-form explanation. Clamped when collapsed. */
  body: string
  /**
   * What the other frameworks said about this substance, each with its authored
   * body intact. Collapsible — it is explanation, not caution.
   */
  alsoFor: MergedBenefit[]
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
  // EVERY distinct GP-check, not just the lead card's. When several frameworks
  // were merged into this card, the cautions they carried are merged too — see
  // `additional_disclaimers` in types/database.ts for why one was being lost.
  for (const text of dedupeDisclaimers([
    rec.disclaimer,
    ...(rec.additional_disclaimers ?? []),
  ])) {
    safetyLines.push({ kind: 'gp_check', text })
  }

  const body = (rec.body ?? '').trim()
  const alsoFor = normaliseAlsoFor(rec.also_for)

  return {
    title: rec.title,
    priority: rec.priority,
    helpsWith: helpsWithFor(rec.targets_symptoms),
    safetyLines,
    body,
    alsoFor,
    // Short cards get no toggle — a "read more" that reveals one extra line is
    // an interaction for nothing.
    isExpandable: body.length > BODY_PREVIEW_CHARS || alsoFor.length > 0,
  }
}

/**
 * The symptoms a card addresses, labelled.
 *
 * Labels come from SYMPTOM_CHOICES — the exact wording onboarding used to ask
 * her about each symptom — so the chip on the card and the question she
 * answered say the same thing. A symptom id with no choice is skipped rather
 * than prettified: inventing a label here would put words in the content's
 * mouth, and `onboarding-influence.test.ts` already guards the two from
 * drifting apart.
 */
function helpsWithFor(symptoms: string[] | undefined): HelpsWith[] {
  if (!symptoms?.length) return []
  const seen = new Set<string>()
  const out: HelpsWith[] = []
  for (const value of symptoms) {
    if (seen.has(value)) continue
    seen.add(value)
    const choice = SYMPTOM_CHOICES.find((c) => c.value === value)
    if (choice) out.push({ value, label: choice.label })
  }
  return out
}

/**
 * Normalise `also_for` to `MergedBenefit[]`, accepting the legacy `string[]`
 * that plans generated before this shipped still hold in the `wellness_plans`
 * JSONB column. A legacy entry keeps its title and gets an empty body — which
 * is all it ever had. See `also_for` in types/database.ts.
 */
function normaliseAlsoFor(
  entries: WellnessRecommendation['also_for']
): MergedBenefit[] {
  const out: MergedBenefit[] = []
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') {
      const title = entry.trim()
      if (title) out.push({ id: '', title, body: '' })
      continue
    }
    const title = entry?.title?.trim()
    if (!title) continue
    out.push({
      id: entry.id ?? '',
      title,
      body: (entry.body ?? '').trim(),
      targets_symptoms: entry.targets_symptoms,
    })
  }
  return out
}

/**
 * Distinct disclaimers, in the order given, for display.
 *
 * THE FIRST ENTRY IS NEVER DROPPED. It is the card's own authored disclaimer —
 * the one `validateFrameworks()` requires and `plan-card-content.test.ts`
 * asserts is surfaced verbatim. Even if a longer sibling caution contains it
 * word for word, removing it would mean a card rendering without the
 * disclaimer written for it, which is not a trade worth making to save a line.
 *
 * Everything after it is reduced only where reduction is provably lossless:
 * identical after whitespace/case normalisation, or contained in full inside a
 * disclaimer that IS being shown. Two cautions that differ by a single word are
 * both kept — in this domain the differing word is the one that matters (the
 * omega-3 cards differ only by "above 3g EPA+DHA").
 */
export function dedupeDisclaimers(texts: (string | undefined)[]): string[] {
  const candidates: { normalised: string; text: string }[] = []
  for (const raw of texts) {
    const text = raw?.trim()
    if (!text) continue
    const normalised = text.replace(/\s+/g, ' ').toLowerCase()
    if (candidates.some((c) => c.normalised === normalised)) continue
    candidates.push({ normalised, text })
  }

  return candidates
    .filter((candidate, i) => {
      if (i === 0) return true // the card's own disclaimer, always
      return !candidates.some(
        (other, j) =>
          j !== i &&
          other.normalised.length > candidate.normalised.length &&
          other.normalised.includes(candidate.normalised)
      )
    })
    .map((c) => c.text)
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
  'additional_disclaimers',
] as const
