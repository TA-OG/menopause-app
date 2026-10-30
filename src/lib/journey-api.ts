/**
 * Request contracts and decisions for /api/journey/**. Pure, no I/O, so every
 * rule a route enforces is tested without a database (as focus-api.ts).
 *
 * Nothing from the client is trusted: the focus area must be one she is
 * offered from her own answers, and which Feel Safe invitation she is
 * answering is worked out here from her start date, never taken from the
 * request.
 */

import { z } from 'zod'
import type { FocusWeek, UserSignals } from '@/types/database'
import {
  MORNING_FEELINGS,
  journeyPosition,
  offeredFocusAreas,
  showSafetySignpost,
  suggestedFocusArea,
  type FocusAreaId,
  type JourneyPosition,
  type MorningFeeling,
} from './journey'
import { nextSession, type SessionId } from './journey-intake'
import type { Refusal } from './focus-api'

const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const StartJourneySchema = z.object({
  focus_area: z.string().min(1).max(40),
  today: LocalDate,
})

export const JourneyDaySchema = z
  .object({
    today: LocalDate,
    feeling: z.enum(MORNING_FEELINGS as [MorningFeeling, ...MorningFeeling[]]).optional(),
    invitation_outcome: z.enum(['done', 'not_today']).optional(),
  })
  .refine((b) => b.feeling !== undefined || b.invitation_outcome !== undefined, {
    message: 'Nothing to save',
  })

export interface JourneyRow {
  focus_area: FocusAreaId
  started_on: string
}

export interface JourneyDayRow {
  day: string
  feeling: MorningFeeling | null
  invitation_id: string | null
  invitation_outcome: 'done' | 'not_today' | null
}

const refuse = (status: Refusal['status'], error: string): Refusal => ({ ok: false, status, error })

/** Can she start (or change) her journey with this focus? */
export function decideStart(
  signals: Pick<UserSignals, 'symptoms'>,
  answeredKeys: ReadonlySet<string>,
  focusArea: string
): { ok: true; focusArea: FocusAreaId } | Refusal {
  if (nextSession(answeredKeys) !== null) {
    return refuse(409, 'There are a few more questions first')
  }
  const offered = offeredFocusAreas(signals)
  const area = offered.find((a) => a.id === focusArea)
  if (!area) return refuse(400, 'That focus is not one of your options')
  return { ok: true, focusArea: area.id }
}

/**
 * The row to write for today's answer. The invitation is the one open today
 * by her own start date; answering one on a day without one is refused.
 */
export function decideDay(
  journey: JourneyRow,
  weeks: readonly Pick<FocusWeek, 'kind' | 'outcome'>[],
  input: { today: string; feeling?: MorningFeeling; invitation_outcome?: 'done' | 'not_today' }
):
  | {
      ok: true
      row: {
        day: string
        feeling?: MorningFeeling
        invitation_id?: string
        invitation_outcome?: 'done' | 'not_today'
      }
    }
  | Refusal {
  if (input.today < journey.started_on) {
    return refuse(400, 'That day is before your journey started')
  }
  const row: { day: string; feeling?: MorningFeeling; invitation_id?: string; invitation_outcome?: 'done' | 'not_today' } = {
    day: input.today,
  }
  if (input.feeling) row.feeling = input.feeling
  if (input.invitation_outcome) {
    const { invitation } = journeyPosition(journey.started_on, input.today, weeks)
    if (!invitation) return refuse(409, 'There is no invitation today')
    row.invitation_id = invitation.id
    row.invitation_outcome = input.invitation_outcome
  }
  return { ok: true, row }
}

// ─── GET /api/journey ─────────────────────────────────────────────────────────

export interface JourneyState {
  name: string | null
  /** The session to ask next, or null when her questions are done. */
  nextSession: SessionId | null
  /** Her answers to the questions Mel reflects back (heardPhrases). Values only. */
  reflected: Record<string, string>
  isPremium: boolean
  offered: FocusAreaId[]
  suggested: FocusAreaId | null
  journey: JourneyRow | null
  position: JourneyPosition | null
  today: JourneyDayRow | null
  showSignpost: boolean
  /** Whether a focus programme (Foundations) is running. */
  foundationsStarted: boolean
}

/** The answers Mel reflects back, and nothing else she told us. */
const REFLECTED_KEYS = ['sleep_quality', 'stress_level', 'self_image', 'how_are_you'] as const

export function buildJourneyState(input: {
  name: string | null
  signals: Pick<UserSignals, 'symptoms' | 'primary_symptom'>
  answers: readonly { question_key: string; answer_value: string }[]
  isPremium: boolean
  journey: JourneyRow | null
  weeks: readonly Pick<FocusWeek, 'kind' | 'outcome'>[]
  foundationsStarted: boolean
  /** Newest first. */
  days: readonly JourneyDayRow[]
  today: string
}): JourneyState {
  const answered = new Set(input.answers.map((a) => a.question_key))
  const reflected: Record<string, string> = {}
  for (const key of REFLECTED_KEYS) {
    const a = input.answers.find((x) => x.question_key === key)
    if (a) reflected[key] = a.answer_value
  }
  const position = input.journey ? journeyPosition(input.journey.started_on, input.today, input.weeks) : null
  const feelings = input.days.flatMap((d) => (d.feeling ? [{ date: d.day, feeling: d.feeling }] : []))
  return {
    name: input.name,
    nextSession: nextSession(answered),
    reflected,
    isPremium: input.isPremium,
    offered: offeredFocusAreas(input.signals).map((a) => a.id),
    suggested: suggestedFocusArea(input.signals)?.id ?? null,
    journey: input.journey,
    position,
    today: input.days.find((d) => d.day === input.today) ?? null,
    showSignpost: showSafetySignpost(feelings, input.today, reflected.how_are_you),
    foundationsStarted: input.foundationsStarted,
  }
}
