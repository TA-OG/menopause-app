/**
 * Translating the onboarding quiz.
 *
 * src/lib/onboarding-config.ts stays the single source of truth for WHAT is
 * asked, and its English labels stay the canonical wording. This module only
 * swaps the words shown to the user for the active locale's
 * (messages/<locale>.json → "Onboarding").
 *
 * It never touches a choice's `value`. Values are the vocabulary frameworks
 * trigger on and what is stored in onboarding_answers, so a French user who
 * taps "Bouffées de chaleur" must still store `hot_flashes` — translating a
 * value would silently stop every framework that matches on it.
 *
 * Every lookup falls back to the English label from the config. The messages
 * tests make that fallback unreachable in practice (every locale must carry
 * every English key, and en.json must match the config word for word), but a
 * fallback to readable English is still safer than next-intl's default of
 * rendering a raw key path in the middle of a health questionnaire.
 */

import type { Choice, OnboardingStep } from './onboarding-config'

type MessageTree = { [key: string]: string | MessageTree }

/**
 * Message key for a choice value or group name. Message keys can't contain
 * '.' (next-intl's path separator) and some values are display-ish strings
 * ("40–44", "Europe/London", "Mindfulness / meditation"), so normalise to
 * [A-Za-z0-9_].
 */
export function messageKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '_'
}

function lookup(tree: MessageTree | undefined, path: string[]): string | undefined {
  let node: string | MessageTree | undefined = tree
  for (const part of path) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' && node.trim() !== '' ? node : undefined
}

/** Onboarding subtree of the full next-intl messages object. */
export function onboardingMessages(messages: unknown): MessageTree | undefined {
  const tree = (messages as MessageTree | undefined)?.Onboarding
  return tree && typeof tree !== 'string' ? tree : undefined
}

/** Translated text at `section.key...`, or `fallback`. */
export function text(msgs: MessageTree | undefined, path: string[], fallback: string): string {
  return lookup(msgs, path) ?? fallback
}

/** Choice list with labels translated; values, emoji and flags untouched. */
export function localizeChoices(
  msgs: MessageTree | undefined,
  section: string[],
  choices: Choice[]
): Choice[] {
  return choices.map((c) => ({
    ...c,
    label: lookup(msgs, [...section, messageKey(c.value)]) ?? c.label,
  }))
}

/** Which Onboarding.choices.<key> a single/multi step reads its labels from. */
export function choiceSection(step: Extract<OnboardingStep, { key: string }>): string[] {
  const key = step.kind === 'single' && step.choiceLabelsFrom ? step.choiceLabelsFrom : step.key
  return ['choices', key]
}

/** Step with title/subtitle/placeholder/CTA translated. Choices are separate (see localizeChoices). */
export function localizeStep(msgs: MessageTree | undefined, step: OnboardingStep): OnboardingStep {
  if (step.kind === 'custom') return step
  const base = ['steps', step.id]
  const out = {
    ...step,
    title: text(msgs, [...base, 'title'], step.title),
    subtitle: step.subtitle === undefined ? undefined : text(msgs, [...base, 'subtitle'], step.subtitle),
  }
  if (out.kind === 'text' && out.placeholder !== undefined) {
    out.placeholder = text(msgs, [...base, 'placeholder'], out.placeholder)
  }
  if (out.kind === 'multi' && out.ctaLabel !== undefined) {
    out.ctaLabel = text(msgs, [...base, 'cta'], out.ctaLabel)
  }
  return out
}
