import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { SubstanceEntry } from '@/types/database'

const REGISTRY_PATH = path.join(process.cwd(), 'content/wellness/substances.yaml')

let cachedRegistry: SubstanceEntry[] | null = null

interface RegistryFile {
  substances: SubstanceEntry[]
}

/**
 * Load the substance registry — the mapping from supplement recommendation IDs
 * to the underlying substance, plus any verified maximum daily intake.
 *
 * Deliberately synchronous and cached: the engine's dedupe/ceiling pass is a
 * pure function and must not become async on account of file I/O.
 */
export function loadSubstanceRegistry(): SubstanceEntry[] {
  if (cachedRegistry && process.env.NODE_ENV === 'production') {
    return cachedRegistry
  }

  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8')
    const parsed = yaml.load(raw) as RegistryFile | null
    const substances = parsed?.substances ?? []
    cachedRegistry = substances
    return substances
  } catch (err) {
    // Registry unreadable — return empty. The engine falls back to ID-level
    // dedupe, which is weaker but never *less* safe than before this existed.
    // validate-content fails the build if the registry is missing or invalid,
    // so this path should be unreachable in a deployed build — which is exactly
    // why it must be loud if it ever happens. Silently losing every dose ceiling
    // is the kind of failure this file exists to prevent.
    console.error(
      '[substance-registry] Could not read content/wellness/substances.yaml — ' +
      'substance deduplication and all dose ceilings are DISABLED for this request:',
      err
    )
    return []
  }
}

// NOTE: the pure helpers that operate on a loaded registry (buildSubstanceIndex,
// formatMaxDailyNote) deliberately live in wellness-engine.ts instead of here.
// This module touches the filesystem; the engine must stay free of I/O imports
// so it remains a pure, fully testable unit and safe to pull into any bundle.
