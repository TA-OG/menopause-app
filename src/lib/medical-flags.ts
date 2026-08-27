/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PERSONAL CIRCUMSTANCE TAGS — medical flags and dietary restrictions
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS FOR
 *
 * Onboarding asks two questions whose answers are, by any reasonable reading,
 * the most safety-relevant things a user tells us:
 *
 *   medical_flags     — oestrogen-sensitive cancer history, anticoagulants,
 *                       pregnancy, thyroid, diabetes, kidney stones, HRT, BP
 *   diet_restrictions — vegan, shellfish allergy, halal, coeliac, and so on
 *
 * Until now neither answer was read by anything. This module is how they come
 * to matter, and it is built on one rule:
 *
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │  A TAG IS AN INDEX INTO EXISTING AUTHORED COPY.                        │
 *   │  It never adds a clinical claim of its own.                            │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * Every pattern below was written by reading the disclaimers already in
 * content/wellness/frameworks/*.yaml and matching the words the authors
 * actually used. `detectFlags()` finds them; `validateFlagTags()` enforces the
 * correspondence in BOTH directions at build time:
 *
 *   tag without supporting copy  → build fails (an invented caution)
 *   supporting copy without tag  → build fails (a caution that silently
 *                                  wouldn't reach the woman it's for)
 *
 * The second direction is the one that matters most, and it is why this is
 * pattern-based rather than a hand-maintained list. A hand-maintained list
 * silently goes stale the first time someone adds a supplement.
 *
 * WHY TAGS NEVER REMOVE A CARD
 *
 * Suppression looks safer than it is. Every omega-3 card in this repo already
 * reads "from fish oil or algae oil ... algae-based omega-3 is the plant-based
 * equivalent" — so a naive "vegan → drop fish oil" rule would delete advice the
 * author had deliberately written to be vegan-safe. Likewise, hiding a
 * supplement from a woman with a cancer history hides the very caution she
 * most needs to read. So a tag surfaces the author's own caution and moves the
 * card down the ranking. It never makes it disappear.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KNOWN GAP — conditions the content cautions about that onboarding never asks
 *
 * Reading every supplement disclaimer surfaced cautions for conditions that are
 * NOT in the `medical_flags` question, so no tag can ever fire for them:
 *
 *   autoimmune conditions   (maca ×2, ashwagandha ×2)
 *   kidney disease          (creatine, vitamin D3+K2, magnesium ×4)
 *   liver conditions        (curcumin, green tea extract)
 *   statins / heart meds    (CoQ10, magnesium ×4)
 *   ulcers / gastritis      (betaine HCL)
 *
 * These are deliberately NOT patterns below — inventing an onboarding answer
 * value that no question collects would produce a tag that can never match.
 * The fix is a product decision (add the options to `MEDICAL_FLAG_CHOICES`),
 * so it is recorded here rather than papered over. `reportUnaskedCautions()`
 * keeps it visible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A user-declared circumstance, and the words authors use when writing about it. */
export interface CircumstancePattern {
  /** Must be a real answer_value from the matching onboarding question. */
  value: string
  /** Reader-facing name, used in the generated note. */
  label: string
  /**
   * Matched against a recommendation's authored copy. Written from the wording
   * actually present in this repo's disclaimers — not from general knowledge.
   */
  pattern: RegExp
}

/**
 * Medical flags. `value` must match a choice in MEDICAL_FLAG_CHOICES
 * (src/lib/onboarding-config.ts) — asserted by onboarding-influence.test.ts.
 */
export const MEDICAL_FLAG_PATTERNS: CircumstancePattern[] = [
  {
    value: 'blood_thinners',
    label: 'you take blood thinners',
    // warfarin / anticoagulant / apixaban / antiplatelet / "thin the blood" /
    // "blood-thinning" / "bleeding risk". Aspirin only counts alongside one of
    // those — "aspirin" alone appears in contexts that are not anticoagulation.
    pattern:
      /\b(warfarin|anticoagulant|anticoagulants|apixaban|antiplatelet)\b|blood[-\s]thinning|thin the blood|bleeding risk/i,
  },
  {
    value: 'thyroid',
    label: 'you have a thyroid condition',
    pattern: /\bthyroid\b/i,
  },
  {
    value: 'diabetes',
    label: 'you have diabetes',
    pattern: /\bdiabet(es|ic)\b|blood sugar (and [a-z ]+)?medication|blood glucose/i,
  },
  {
    value: 'pregnant_breastfeeding',
    label: "you're pregnant or breastfeeding",
    pattern: /\bpregnan(t|cy)\b|breastfeed(ing)?/i,
  },
  {
    value: 'kidney_stones',
    // Deliberately narrow. "kidney disease" is a DIFFERENT condition and is not
    // matched here — onboarding does not ask about it (see KNOWN GAP above).
    label: 'you have a history of kidney stones',
    pattern: /kidney stones?/i,
  },
  {
    value: 'high_blood_pressure',
    label: 'you have high blood pressure',
    pattern: /blood pressure medication|antihypertensive/i,
  },
  {
    value: 'oestrogen_sensitive',
    label: 'you have a history of an oestrogen-sensitive condition',
    pattern:
      /(o)?estrogen[-\s]sensitive|hormone[-\s]sensitive|breast cancer|ovarian cancer/i,
  },
]

/**
 * Dietary restrictions. `value` must match a choice in DIET_RESTRICTION_CHOICES.
 *
 * Only restrictions the content actually speaks to are listed. There is no
 * pattern for halal, kosher, gluten_free, soy_free, nut_allergy or dairy_free
 * because no authored copy addresses them — adding one would mean inventing a
 * dietary claim about a supplement's sourcing that no author has verified.
 */
export const DIET_RESTRICTION_PATTERNS: CircumstancePattern[] = [
  {
    value: 'shellfish_allergy',
    label: 'you have a shellfish allergy',
    pattern: /shellfish/i,
  },
]

/** Every circumstance pattern, medical and dietary. */
export const ALL_CIRCUMSTANCE_PATTERNS: CircumstancePattern[] = [
  ...MEDICAL_FLAG_PATTERNS,
  ...DIET_RESTRICTION_PATTERNS,
]

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DISCLAIMER-DERIVED vs AUTHORED — why cautions are computed, not hand-tagged
 *
 * Cautions are DERIVED from the disclaimer rather than typed into the YAML by
 * hand. That is a deliberate departure from substances.yaml, which IS
 * hand-authored — and the reason for the difference matters:
 *
 *   A dose ceiling cannot be read off a disclaimer. It is external knowledge
 *   that must be looked up, cited, and reviewed, so it is authored explicitly.
 *
 *   A caution IS the disclaimer. "Do not take if you are on anticoagulant
 *   medication" already says everything the `blood_thinners` tag would say.
 *   Copying that into a second place adds no information and creates a way for
 *   the two to disagree.
 *
 * Deriving it closes the failure mode that actually costs someone: a new
 * supplement added next month gets its cautions wired to the user's declared
 * flags automatically. Nobody has to remember. The alternative — a hand-kept
 * list — fails silently and in the dangerous direction.
 *
 * Detection is restricted to the DISCLAIMER for exactly this reason. Running it
 * over bodies too was tested and rejected: `lf_cardio_heart` and
 * `mr_heart_risk_awareness` both name diabetes as a cardiovascular RISK FACTOR,
 * not as a caution, and would have produced a "you told us you have diabetes"
 * warning on a card about walking. Bodies are available to `justifiedBy()` for
 * deliberately authored tags, and only there.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Cautions a recommendation's own DISCLAIMER demonstrably raises.
 *
 * This is the required set: it needs no authoring and cannot be forgotten.
 */
export function detectCautions(rec: {
  disclaimer?: string
}): string[] {
  const text = (rec.disclaimer ?? '').replace(/\s+/g, ' ')
  if (!text.trim()) return []
  return ALL_CIRCUMSTANCE_PATTERNS.filter((p) => p.pattern.test(text)).map(
    (p) => p.value
  )
}

/**
 * Whether a deliberately AUTHORED `caution_for` / `adapt_for` tag is supported
 * by the card's own copy (disclaimer or body).
 *
 * Authored tags exist for the minority of cases where the relevant sentence
 * sits in the body rather than the disclaimer. `validateCircumstanceTags()`
 * rejects any that this returns false for, which is what stops a tag from
 * asserting something no author has written.
 */
export function justifiedBy(
  value: string,
  rec: { body?: string; disclaimer?: string }
): boolean {
  const pattern = ALL_CIRCUMSTANCE_PATTERNS.find((p) => p.value === value)
  if (!pattern) return false
  const text = `${rec.disclaimer ?? ''} ${rec.body ?? ''}`.replace(/\s+/g, ' ')
  return pattern.pattern.test(text)
}

/**
 * Every circumstance that should surface a note for this recommendation:
 * derived cautions, plus any authored additions.
 */
export function circumstancesFor(rec: {
  body?: string
  disclaimer?: string
  caution_for?: string[]
  adapt_for?: string[]
}): string[] {
  const authored = [...(rec.caution_for ?? []), ...(rec.adapt_for ?? [])]
  return Array.from(new Set([...detectCautions(rec), ...authored]))
}

/** Values that belong to the dietary vocabulary rather than the medical one. */
const DIET_VALUES = new Set(DIET_RESTRICTION_PATTERNS.map((p) => p.value))

/** Which kind of note a circumstance produces. */
export function noteKindFor(value: string): 'caution' | 'adapt' {
  return DIET_VALUES.has(value) ? 'adapt' : 'caution'
}

/** Look up the reader-facing label for a declared circumstance value. */
export function labelFor(value: string): string | undefined {
  return ALL_CIRCUMSTANCE_PATTERNS.find((p) => p.value === value)?.label
}
