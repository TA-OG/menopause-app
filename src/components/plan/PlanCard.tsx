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

      {/* ── ALWAYS VISIBLE ────────────────────────────────────────────────
          Above the fold, unconditionally, whether the card is open or shut.
          A caution she has to tap to discover is a caution that doesn't
          exist. */}
      {content.safetyLines.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {content.safetyLines.map((line) => {
            const style = SAFETY_STYLE[line.kind]
            return (
              <p
                key={line.kind}
                className={`rounded-xl border px-3 py-2 text-sm font-medium leading-relaxed ${style.className}`}
              >
                <span aria-hidden="true">{style.icon} </span>
                <span className="sr-only">{style.label}: </span>
                {line.text}
              </p>
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

      {expanded && content.alsoFor.length > 0 && (
        <div className="mt-3 text-sm text-gray-600">
          <p className="font-medium">Also suggested for:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {content.alsoFor.map((reason, i) => (
              <li key={i}>{reason}</li>
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
