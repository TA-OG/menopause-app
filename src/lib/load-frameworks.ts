import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework } from '@/types/database'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const SKIP_FILES = ['template.yaml']

let cachedFrameworks: WellnessFramework[] | null = null

export async function loadFrameworks(): Promise<WellnessFramework[]> {
  // Cache in production, reload in development
  if (cachedFrameworks && process.env.NODE_ENV === 'production') {
    return cachedFrameworks
  }

  try {
    const files = fs
      .readdirSync(FRAMEWORKS_DIR)
      .filter((f) => f.endsWith('.yaml') && !SKIP_FILES.includes(f))

    const frameworks = files.map((file) => {
      const content = fs.readFileSync(path.join(FRAMEWORKS_DIR, file), 'utf8')
      return yaml.load(content) as WellnessFramework
    })

    cachedFrameworks = frameworks
    return frameworks
  } catch {
    // No frameworks yet — return empty array (plan will be empty)
    return []
  }
}
