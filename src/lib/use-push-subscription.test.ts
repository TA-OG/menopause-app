import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isPushPromptSnoozed, snoozePushPrompt } from './use-push-subscription'

const DAY = 24 * 60 * 60 * 1000

describe('push opt-in snooze', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is not snoozed when the prompt has never been dismissed', () => {
    expect(isPushPromptSnoozed()).toBe(false)
  })

  it('stays snoozed for 30 days after "Not now", then shows again', () => {
    const t0 = Date.UTC(2026, 10, 3)
    snoozePushPrompt(t0)
    expect(isPushPromptSnoozed(t0 + 29 * DAY)).toBe(true)
    expect(isPushPromptSnoozed(t0 + 30 * DAY)).toBe(false)
  })

  it('treats a corrupt stored value as not snoozed rather than hiding the prompt forever', () => {
    store.set('push_optin_snoozed_at', 'garbage')
    expect(isPushPromptSnoozed()).toBe(false)
  })

  it('shows the prompt when storage is blocked instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(isPushPromptSnoozed()).toBe(false)
    expect(() => snoozePushPrompt()).not.toThrow()
  })
})
