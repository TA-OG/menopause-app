import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework } from '@/types/database'
import { STEPS, collectedKeys } from './onboarding-config'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')

function loadFrameworks(): WellnessFramework[] {
  return fs
    .readdirSync(FRAMEWORKS_DIR)
    .filter((f) => f.endsWith('.yaml') && f !== 'template.yaml')
    .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)
}

describe('onboarding config integrity', () => {
  it('has globally unique step keys', () => {
    const keys = collectedKeys()
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has unique choice values within every choice-based step', () => {
    for (const step of STEPS) {
      if ((step.kind === 'single' || step.kind === 'multi') && 'choices' in step && step.choices) {
        const values = step.choices.map((c) => c.value)
        expect(new Set(values).size, `duplicate choice value in step "${step.id}"`).toBe(values.length)
      }
    }
  })

  it('uses snake_case keys (the framework trigger vocabulary)', () => {
    for (const key of collectedKeys()) {
      expect(key, `key "${key}" must be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
})

describe('engine ↔ onboarding contract', () => {
  // The wellness engine matches frameworks against onboarding answers by
  // question_key. If a framework triggers on a key onboarding never collects,
  // it silently never fires. This test makes that impossible to ship.
  it('collects every question_key that frameworks trigger on', () => {
    const collected = new Set(collectedKeys())
    const frameworks = loadFrameworks()

    const referenced = new Set<string>()
    for (const fw of frameworks) {
      for (const cond of fw.trigger_conditions ?? []) {
        if (cond?.question) referenced.add(cond.question)
      }
    }

    const missing = Array.from(referenced).filter((q) => !collected.has(q))
    expect(missing, `frameworks trigger on uncollected question_key(s): ${missing.join(', ')}`).toEqual([])
  })
})
