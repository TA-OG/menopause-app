/**
 * The rendered history, not just the helpers behind it.
 *
 * Written with createElement rather than JSX, like PlanCard.render.test.ts,
 * so the test does not depend on build configuration to keep running.
 */

import { describe, it, expect } from 'vitest'
import { createElement, type ComponentProps, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import CheckinHistoryList from './CheckinHistoryList'
import CheckinTrends from './CheckinTrends'
import type { HistoryRow } from '@/lib/checkin-history'

// The provider's props type marks children required, but createElement takes
// children as its third argument (react/no-children-prop), so type it without.
const IntlProvider = NextIntlClientProvider as unknown as ComponentType<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

function render(element: ReactElement, locale: 'en' | 'fr' = 'en'): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: locale === 'en' ? en : fr, timeZone: 'Europe/London' },
      element
    )
  )
}

function row(checkin_date: string, overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: `id-${checkin_date}`,
    checkin_date,
    symptoms: {},
    mood_score: null,
    energy_level: null,
    sleep_hours: null,
    notes: null,
    ...overrides,
  }
}

const ROWS: HistoryRow[] = [
  row('2026-11-03', {
    mood_score: 4,
    energy_level: 2,
    sleep_hours: 6.5,
    symptoms: { hot_flashes: 3, vaginal_dryness: 5, anxiety: 1 },
    notes: 'Bad night <script>alert(1)</script>',
  }),
  row('2026-10-30'),
]

describe('CheckinHistoryList', () => {
  it('groups by month, newest first', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }))
    expect(html.indexOf('November 2026')).toBeGreaterThan(-1)
    expect(html.indexOf('November 2026')).toBeLessThan(html.indexOf('October 2026'))
  })

  it('labels every value, so 4/5 can never be mistaken for the wrong score', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }))
    expect(html).toMatch(/Mood <span[^>]*>4\/5<\/span>/)
    expect(html).toMatch(/Energy <span[^>]*>2\/5<\/span>/)
    expect(html).toMatch(/Sleep <span[^>]*>6.5h<\/span>/)
  })

  it('shows a label for every symptom, including ones the form no longer offers', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }))
    expect(html).toContain('Vaginal dryness')
    expect(html).not.toContain('vaginal_dryness')
    expect(html).not.toContain('Symptoms.')
  })

  it('lists the most severe symptom first', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }))
    expect(html.indexOf('Vaginal dryness')).toBeLessThan(html.indexOf('Hot flushes'))
  })

  it('omits values she did not log rather than showing a zero', () => {
    const html = render(createElement(CheckinHistoryList, { rows: [row('2026-10-30')] }))
    expect(html).not.toContain('Mood')
    expect(html).toContain('No symptoms rated')
  })

  it('escapes her notes', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders in her language', () => {
    const html = render(createElement(CheckinHistoryList, { rows: ROWS }), 'fr')
    expect(html).toContain('novembre 2026')
    expect(html).toContain('Bouffées de chaleur')
    expect(html).toContain('Humeur')
  })
})

describe('CheckinTrends', () => {
  it('renders nothing date-dependent on the server, so hydration cannot disagree about today', () => {
    // "today" is the device's calendar day, resolved after mount. If the
    // server rendered it, a UTC server and a UK phone would disagree for an
    // hour each night and React would hydrate against the wrong date.
    const html = render(createElement(CheckinTrends, { rows: ROWS }))
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('Last 30 days')
    expect(html).not.toContain('checked in today')
  })
})
