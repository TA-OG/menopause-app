'use client'

import { useRef, useState } from 'react'
import PlanCard from './PlanCard'
import type { WellnessRecommendation } from '@/types/database'

/**
 * The plan, in four tabs instead of one continuous scroll.
 *
 * WHY TABS AND COLLAPSING, TOGETHER
 * Tabs alone would turn one pile of 105 cards into four piles of ~26 — better,
 * but still not readable. Tabs sort the plan into the four questions a reader
 * actually has ("what do I eat / do / think about / take"), and PlanCard
 * collapses the long-form body inside each. Neither half is sufficient alone.
 *
 * WHY THE TAB LIVES IN THE URL
 * She can send her supplements tab to her GP, reload without losing her place,
 * and the browser back button does what she expects. The URL is updated with
 * history.replaceState rather than the Next router so that switching tabs is
 * instant and never triggers a server round-trip — the whole plan is already on
 * the client.
 */

export interface PlanTabsProps {
  diet: WellnessRecommendation[]
  lifestyle: WellnessRecommendation[]
  mindset: WellnessRecommendation[]
  supplements: WellnessRecommendation[]
  /** From the server's searchParams, so a shared or reloaded URL opens right. */
  initialTab?: string
}

type TabKey = 'diet' | 'lifestyle' | 'mindset' | 'supplements'

const TAB_META: { key: TabKey; label: string; emoji: string }[] = [
  { key: 'diet', label: 'Food', emoji: '🥗' },
  { key: 'lifestyle', label: 'Doing', emoji: '🌿' },
  { key: 'mindset', label: 'Thinking', emoji: '🧘' },
  { key: 'supplements', label: 'Supplements', emoji: '💊' },
]

export default function PlanTabs({
  diet,
  lifestyle,
  mindset,
  supplements,
  initialTab,
}: PlanTabsProps) {
  const groups: Record<TabKey, WellnessRecommendation[]> = {
    diet,
    lifestyle,
    mindset,
    supplements,
  }

  // A tab with nothing in it is noise — free-tier users have no supplements,
  // and a narrow plan may not fire every category.
  const tabs = TAB_META.filter((t) => groups[t.key].length > 0)

  const requested = tabs.find((t) => t.key === initialTab)?.key
  const [active, setActive] = useState<TabKey>(requested ?? tabs[0]?.key ?? 'diet')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  if (tabs.length === 0) return null

  function select(key: TabKey) {
    setActive(key)
    // Keep the URL honest without re-rendering from the server.
    const url = new URL(window.location.href)
    url.searchParams.set('tab', key)
    window.history.replaceState(null, '', url)
  }

  // Arrow-key navigation is part of the ARIA tab pattern, not a nicety.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    e.preventDefault()
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    select(next.key)
    tabRefs.current[next.key]?.focus()
  }

  const activeCards = groups[active]

  return (
    <div>
      {/* Sticky under the fixed 64px app header, so she can change tab without
          scrolling back to the top of a long list. */}
      <div
        role="tablist"
        aria-label="Your plan, by category"
        className="sticky top-16 z-30 -mx-4 flex gap-1 bg-cream px-4 pb-2 pt-1"
      >
        {tabs.map((tab, i) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el
              }}
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              // min-h-11 = 44px minimum touch target.
              className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-white text-brand-900 shadow-sm'
                  : 'text-gray-600 hover:bg-white/60'
              }`}
            >
              <span className="flex items-center gap-1">
                <span aria-hidden="true">{tab.emoji}</span>
                {tab.label}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  isActive ? 'text-brand-600' : 'text-gray-400'
                }`}
              >
                {groups[tab.key].length}
                <span className="sr-only"> recommendations</span>
              </span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        className="mt-3 flex flex-col gap-3 focus:outline-none"
      >
        {activeCards.map((rec) => (
          <PlanCard key={rec.id} rec={rec} />
        ))}
      </div>
    </div>
  )
}
