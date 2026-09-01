'use client'

import { useId, useState } from 'react'
import { planCardContent, type SafetyLine } from '@/lib/plan-card-content'
import type { WellnessRecommendation } from '@/types/database'

/**
 * One recommendation, collapsed by default.
 *
 * What is collapsible and what is not is decided by planCardContent() — a pure
 * function with its own tests — rather than by the order of JSX here. Do not
 * move safety copy into the collapsible block: plan-card-content.test.ts will
 * fail, which is the point.
 */

const SAFETY_STYLE: Record<
  SafetyLine['kind'],
  { className: string; icon: string; label: string }
> = {
  // Her own declared circumstance. Strongest treatment — it is the one line on
  // this card written about her rather than about the substance.
  personal: {
    className: 'bg-blush-50 border-blush-300 text-blush-900',
    icon: '🩺',
    label: 'Applies to you',
  },
  // The cumulative ceiling across the whole plan.
  ceiling: {
    className: 'bg-red-50 border-red-200 text-red-900',
    icon: '🛑',
    label: 'Maximum daily amount',
  },
  gp_check: {
    className: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: '⚠️',
    label: 'Check with your GP',
  },
}

/** Reader-facing priority. "high" is our word, not hers. */
const PRIORITY_LABEL = {
  high: 'Most important for you',
  medium: 'Worth doing',
  low: 'When you have capacity',
} as const

const PRIORITY_DOT = {
  high: 'bg-blush-500',
  medium: 'bg-amber-400',
  low: 'bg-brand-300',
} as const

export default function PlanCard({ rec }: { rec: WellnessRecommendation }) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const content = planCardContent(rec)

  // Preserves first-appearance order of kinds: personal → ceiling → gp_check.
  // Source order is what a screen reader follows, and PlanCard.render.test.ts
  // asserts it, so this must never become a sort.
  const safetyGroups = (['personal', 'ceiling', 'gp_check'] as const)
    .map((kind) => [kind, content.safetyLines.filter((l) => l.kind === kind)] as const)
    .filter(([, lines]) => lines.length > 0)

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-gray-900">
          {content.title}
        </h3>
        {/* Priority is never colour alone — the dot carries a text equivalent
            for screen readers, and this audience skews to an age where colour
            discrimination and contrast sensitivity are already changing. */}
        <span className="mt-1.5 flex-shrink-0">
          <span
            className={`block h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[content.priority]}`}
            aria-hidden="true"
          />
          <span className="sr-only">{PRIORITY_LABEL[content.priority]}</span>
        </span>
      </div>

      {/* Which of her symptoms this one card covers. Always visible, and on a
          merged card this is the whole point: one magnesium card carrying
          "Sleep problems · Anxiety · Mood changes" replaces five cards she
          would otherwise have had to read to find out the same thing. */}
      {content.helpsWith.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Helps with">
          {content.helpsWith.map((symptom) => (
            <li
              key={symptom.value}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800"
            >
              {symptom.label}
            </li>
          ))}
        </ul>
      )}

      {/* ── ALWAYS VISIBLE ────────────────────────────────────────────────
          Above the fold, unconditionally, whether the card is open or shut.
          A caution she has to tap to discover is a caution that doesn't
          exist.

          Grouped by kind rather than one box per line. A merged card can carry
          several distinct GP-checks (the frameworks that were collapsed into it
          wrote their own), and three stacked amber boxes saying nearly the same
          thing reads as noise to scroll past — which is how a caution stops
          working. Same words, one block. Nothing is dropped here; what can be
          dropped is decided by dedupeDisclaimers(), where it is tested. */}
      {safetyGroups.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {safetyGroups.map(([kind, lines]) => {
            const style = SAFETY_STYLE[kind]
            return (
              <div
                key={kind}
                className={`rounded-xl border px-3 py-2 text-sm font-medium leading-relaxed ${style.className}`}
              >
                <span aria-hidden="true">{style.icon} </span>
                <span className="sr-only">{style.label}: </span>
                {lines.map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1.5' : 'inline'}>
                    {line.text}
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── COLLAPSIBLE ───────────────────────────────────────────────────
          Clamped with CSS rather than removed from the DOM, so a screen
          reader still reaches every word without expanding anything. Hiding
          health content from assistive tech to save a sighted reader some
          scrolling would be the wrong trade in this app. */}
      {content.body && (
        <p
          id={bodyId}
          className={`whitespace-pre-line text-base leading-relaxed text-gray-700 ${
            expanded || !content.isExpandable ? '' : 'line-clamp-3'
          }`}
        >
          {content.body}
        </p>
      )}

      {/* What the other frameworks said about this substance.
          Each keeps its own authored body — previously only the titles
          survived the merge, so a reader who expanded a magnesium card found
          four headings and none of the guidance written under them. */}
      {expanded && content.alsoFor.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h4 className="text-sm font-semibold text-gray-900">
            Also suggested for
          </h4>
          <ul className="mt-2 space-y-3">
            {content.alsoFor.map((benefit, i) => (
              <li key={benefit.id || i}>
                <p className="text-sm font-medium text-gray-800">
                  {benefit.title}
                </p>
                {benefit.body && (
                  <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {benefit.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.isExpandable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          // min-h-11 = 44px, the minimum comfortable touch target.
          className="mt-1 flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900"
        >
          {expanded ? 'Show less' : 'Read more'}
          <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
        </button>
      )}
    </article>
  )
}
