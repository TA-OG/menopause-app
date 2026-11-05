import { describe, it, expect } from 'vitest'
import { safeNext } from './safe-redirect'

describe('safeNext', () => {
  it('keeps an in-app path, with its query and hash', () => {
    expect(safeNext('/symptom-checkin/history')).toBe('/symptom-checkin/history')
    expect(safeNext('/my-plan?tab=diet')).toBe('/my-plan?tab=diet')
    expect(safeNext('/learn/sleep#video')).toBe('/learn/sleep#video')
  })

  it('falls back when there is nothing usable', () => {
    expect(safeNext(null)).toBe('/dashboard')
    expect(safeNext(undefined)).toBe('/dashboard')
    expect(safeNext('')).toBe('/dashboard')
    expect(safeNext('my-plan')).toBe('/dashboard')
  })

  it('uses the fallback it is given', () => {
    expect(safeNext(null, '/my-plan')).toBe('/my-plan')
  })

  it('refuses anything a browser would resolve to another site', () => {
    for (const hostile of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      // Browsers strip tabs and newlines before resolving, which turns each of
      // these into "//evil.example". A prefix check on the raw string let
      // them through.
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r\n/evil.example',
      '/\\\t\\evil.example',
    ]) {
      expect(safeNext(hostile), JSON.stringify(hostile)).toBe('/dashboard')
    }
  })

  it('refuses auth and API routes, which can only loop or act on her behalf', () => {
    expect(safeNext('/auth/sign-in')).toBe('/dashboard')
    expect(safeNext('/auth/callback?code=x')).toBe('/dashboard')
    expect(safeNext('/api/account/delete')).toBe('/dashboard')
    expect(safeNext('/api')).toBe('/dashboard')
    // …including when dot segments are used to reach them.
    expect(safeNext('/learn/../api/account/delete')).toBe('/dashboard')
  })

  it('does not mistake a page that merely starts with those letters for one', () => {
    expect(safeNext('/authors')).toBe('/authors')
    expect(safeNext('/apiary')).toBe('/apiary')
  })

  it('returns the normalised path, so what is checked is what is followed', () => {
    expect(safeNext('/learn/./sleep')).toBe('/learn/sleep')
  })
})
