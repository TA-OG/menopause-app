import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@/lib/locale-geo-map'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import es from '../../messages/es.json'
import de from '../../messages/de.json'
import pt from '../../messages/pt.json'

/**
 * Pure helpers for the daily check-in reminder cron
 * (src/app/api/cron/notifications/route.ts). Extracted so the local-time
 * logic — where a bug would send at the wrong hour or on the wrong day — is
 * testable without a database or a webpush client.
 */

export interface LocalMoment {
  hour: number
  /** YYYY-MM-DD in the target timezone, used for once-per-day idempotency. */
  date: string
}

/**
 * The current local hour (0-23) and calendar date in the given IANA timezone,
 * or null if the timezone is missing or invalid.
 *
 * Callers MUST treat null as "cannot localise" and skip — never fall back to
 * UTC, which could fire a reminder at 3am for someone whose timezone simply
 * hasn't been captured yet.
 */
export function localHourAndDate(timezone: string | null | undefined): LocalMoment | null {
  if (!timezone) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(new Date())
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const hour = Number(get('hour'))
    const date = `${get('year')}-${get('month')}-${get('day')}`
    if (Number.isNaN(hour)) return null
    return { hour, date }
  } catch {
    // Invalid IANA timezone string (Intl throws RangeError)
    return null
  }
}

/**
 * Whether the check-in reminder is due for this user on this tick: it's
 * their chosen notification_hour where they are, and they haven't already
 * logged a check-in for their local date. A null hour means none has been
 * set (the subscribe route defaults it to 9), so it's never due. The
 * once-per-day claim in notification_log is enforced separately by the
 * database (migration 040).
 */
export function isCheckinNudgeDue(
  local: LocalMoment | null,
  notificationHour: number | null,
  checkedInToday: boolean
): boolean {
  if (!local || notificationHour === null) return false
  return local.hour === notificationHour && !checkedInToday
}

/**
 * The check-in reminder in the user's own language (profiles.locale). The
 * body lives in messages/*.json (Push.checkinBody) with the rest of the
 * app's copy; the title is the brand name and stays as it is. Anything not a
 * supported locale falls back to English rather than sending nothing.
 */
const PUSH_MESSAGES: Record<Locale, { checkinBody: string }> = {
  en: en.Push,
  fr: fr.Push,
  es: es.Push,
  de: de.Push,
  pt: pt.Push,
}

export function checkinNudgeMessage(locale: string | null | undefined) {
  const lang = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  return {
    title: 'Aunty Mel',
    body: PUSH_MESSAGES[lang].checkinBody,
    url: '/symptom-checkin',
  }
}
