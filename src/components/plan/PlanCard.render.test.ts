/**
 * The rendered card, not just the rule behind it.
 *
 * plan-card-content.test.ts proves the SPLIT is correct — which copy is
 * always-visible and which is collapsible. It cannot prove the component
 * actually honours that split. A single misplaced line of JSX would move a
 * disclaimer inside the collapsed block with every one of those tests still
 * green.
 *
 * So this renders the real component to markup and inspects it. Written with
 * createElement rather than JSX because vitest runs esbuild against a tsconfig
 * with `jsx: preserve`, and a test that needs build configuration to exist is a
 * test that quietly stops running.
 */

import { describe, it, expect } from 'vitest'
import { createElement, type ComponentProps, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import de from '../../../messages/de.json'
import PlanCard from './PlanCard'
import type { WellnessRecommendation } from '@/types/database'

const LONG_BODY =
  'Magnesium glycinate taken before bed has reasonable evidence for sleep onset ' +
  'and continuity. It relaxes smooth muscle, lowers cortisol, and supports GABA, ' +
  'the brain’s main calming neurotransmitter. Start at the lower end and build.'

/** A supplement carrying all three kinds of safety copy at once. */
const CAUTIONED: WellnessRecommendation = {
  id: 'ss_probe',
  title: 'Magnesium glycinate',
  body: LONG_BODY,
  priority: 'high',
  category: 'supplement',
  disclaimer: 'GP-CHECK-SENTINEL: always check with your GP or pharmacist first.',
  max_daily_note: 'CEILING-SENTINEL: maximum 400mg per day in total.',
  personal_note: {
    kind: 'caution',
    because: ['blood_thinners'],
    text: 'PERSONAL-SENTINEL: you told us you take blood thinners.',
  },
  additional_disclaimers: ['MERGED-GP-CHECK-SENTINEL: start at 200mg.'],
  targets_symptoms: ['sleep_problems', 'anxiety'],
  also_for: [
    {
      id: 'ss_merged',
      title: 'ALSO-FOR-SENTINEL',
      body: 'ALSO-FOR-BODY-SENTINEL',
    },
  ],
}

// The provider's props type marks children required, but createElement takes
// children as its third argument (react/no-children-prop), so type it without.
const IntlProvider = NextIntlClientProvider as unknown as ComponentType<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>
const MESSAGES = { en, fr, de } as const

function render(rec: WellnessRecommendation, locale: keyof typeof MESSAGES = 'en'): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: MESSAGES[locale], timeZone: 'Europe/London' },
      createElement(PlanCard, { rec })
    )
  )
}

describe('PlanCard renders the collapse rule it is given', () => {
  const html = render(CAUTIONED)

  it('shows all three kinds of safety copy while collapsed', () => {
    for (const sentinel of [
      'PERSONAL-SENTINEL',
      'CEILING-SENTINEL',
      'GP-CHECK-SENTINEL',
      // Inherited from a card collapsed into this one. It is a caution that
      // used to be discarded by the merge entirely — it must render, and it
      // must render while collapsed like every other caution.
      'MERGED-GP-CHECK-SENTINEL',
    ]) {
      expect(html, `${sentinel} is missing from the collapsed card`).toContain(
        sentinel
      )
    }
  })

  it('puts every safety line BEFORE the body in the markup', () => {
    // Source order is what a screen reader follows and what survives CSS
    // changes. The caution must not be reachable only after the explanation.
    const bodyAt = html.indexOf('Magnesium glycinate taken before bed')
    expect(bodyAt).toBeGreaterThan(-1)
    for (const sentinel of [
      'PERSONAL-SENTINEL',
      'CEILING-SENTINEL',
      'GP-CHECK-SENTINEL',
    ]) {
      expect(
        html.indexOf(sentinel),
        `${sentinel} renders after the body`
      ).toBeLessThan(bodyAt)
    }
  })

  it('leads with her own declared circumstance', () => {
    expect(html.indexOf('PERSONAL-SENTINEL')).toBeLessThan(
      html.indexOf('CEILING-SENTINEL')
    )
    expect(html.indexOf('CEILING-SENTINEL')).toBeLessThan(
      html.indexOf('GP-CHECK-SENTINEL')
    )
  })

  it('clamps the body visually rather than removing it', () => {
    // The words are present in the DOM even while collapsed, so assistive tech
    // reaches them without expanding. Only the visual height is capped.
    expect(html).toContain('line-clamp-3')
    expect(html).toContain('Start at the lower end and build.')
  })

  it('keeps the collapsible extras out of the collapsed card', () => {
    expect(html).not.toContain('ALSO-FOR-SENTINEL')
    expect(html).not.toContain('ALSO-FOR-BODY-SENTINEL')
  })

  it('shows which symptoms the card covers without expanding it', () => {
    // The headline of a merged card: she can see her symptom is covered
    // without opening anything. Labels come from SYMPTOM_CHOICES.
    expect(html).toContain('Sleep problems')
    expect(html).toContain('Anxiety')
  })

  it('renders several GP-checks as one caution block, not a stack of boxes', () => {
    // Both texts present...
    expect(html).toContain('GP-CHECK-SENTINEL')
    expect(html).toContain('MERGED-GP-CHECK-SENTINEL')
    // ...inside a single amber container. Three near-identical warning boxes
    // is how a caution turns into wallpaper.
    const boxes = html.split('bg-amber-50').length - 1
    expect(boxes).toBe(1)
  })

  it('renders a plan stored with the legacy string[] also_for', () => {
    // Plans generated before also_for carried bodies are still in the DB.
    const legacy = render({
      id: 'legacy',
      title: 'Legacy',
      body: LONG_BODY,
      priority: 'medium',
      category: 'supplement',
      also_for: ['LEGACY-TITLE-SENTINEL'],
    })
    expect(legacy).toContain('Read more')
    expect(legacy).not.toContain('LEGACY-TITLE-SENTINEL')
  })

  it('offers an accessible, large-enough toggle', () => {
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Read more')
    // 44px minimum touch target — this audience is at the age where
    // presbyopia and reduced fine motor precision both start to matter.
    expect(html).toContain('min-h-11')
  })

  it('never conveys priority by colour alone', () => {
    expect(html).toContain('Most important for you')
  })

  it('renders no toggle when there is nothing to expand', () => {
    const short = render({
      id: 'short',
      title: 'Short one',
      body: 'Two words.',
      priority: 'low',
      category: 'lifestyle',
    })
    expect(short).not.toContain('Read more')
    expect(short).not.toContain('line-clamp-3')
  })

  it('renders a plain card with no safety copy cleanly', () => {
    const plain = render({
      id: 'plain',
      title: 'Plain',
      body: LONG_BODY,
      priority: 'medium',
      category: 'diet',
    })
    expect(plain).toContain('Plain')
    expect(plain).toContain('Read more')
    expect(plain).not.toContain('Check with your GP')
  })
})

describe('PlanCard in another language', () => {
  const html = render(CAUTIONED, 'fr')

  it('re-composes her personal note in French from the declared values', () => {
    expect(html).toContain('Vous nous avez indiqué que vous prenez des anticoagulants.')
    expect(html).not.toContain('PERSONAL-SENTINEL')
  })

  it('keeps every other safety line visible while collapsed', () => {
    for (const sentinel of ['GP-CHECK-SENTINEL', 'CEILING-SENTINEL', 'MERGED-GP-CHECK-SENTINEL']) {
      expect(html).toContain(sentinel)
    }
  })

  it('labels the symptom chips and the toggle in French', () => {
    expect(html).toContain('Troubles du sommeil')
    expect(html).toContain('Lire la suite')
    expect(html).not.toContain('Sleep problems')
  })

  it("joins several circumstances with the locale's own list grammar", () => {
    const two = render(
      { ...CAUTIONED, personal_note: { ...CAUTIONED.personal_note!, because: ['blood_thinners', 'diabetes'] } },
      'de'
    )
    expect(two).toContain('Du hast uns gesagt, dass du Blutverdünner nimmst und du Diabetes hast.')
  })

  it('falls back to the English note rather than drop part of it', () => {
    const unknown = render(
      { ...CAUTIONED, personal_note: { ...CAUTIONED.personal_note!, because: ['not_a_real_flag'] } },
      'fr'
    )
    expect(unknown).toContain('PERSONAL-SENTINEL')
  })
})
