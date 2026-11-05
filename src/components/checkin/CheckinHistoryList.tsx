import { useLocale, useTranslations } from 'next-intl'
import { parseLocalCalendarDate } from '@/lib/checkin-schema'
import { groupByMonth, ratedSymptoms, type HistoryRow } from '@/lib/checkin-history'

/**
 * Every check-in, grouped by month. Each day is a native <details>: the
 * summary line is enough to scan a month, and opening it shows everything she
 * logged. Native disclosure needs no JavaScript and is keyboard- and
 * screen-reader-accessible as it stands.
 *
 * Read-only. The form edits today only, and nothing here suggests otherwise.
 */
export default function CheckinHistoryList({ rows }: { rows: HistoryRow[] }) {
  const locale = useLocale()
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      {groupByMonth(rows).map((group) => {
        const monthDate = parseLocalCalendarDate(`${group.month}-01`)
        return (
          <section key={group.month}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {monthDate ? monthFormat.format(monthDate) : group.month}
            </h3>
            <ol className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {group.rows.map((row) => (
                <li key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <CheckinEntry row={row} />
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

export function CheckinEntry({ row }: { row: HistoryRow }) {
  const t = useTranslations('CheckinHistory')
  const label = useTranslations('Symptoms')
  const locale = useLocale()

  const date = parseLocalCalendarDate(row.checkin_date)
  const heading = date
    ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
    : row.checkin_date

  const symptoms = ratedSymptoms(row.symptoms)
  const sleep = row.sleep_hours === null ? null : Number(row.sleep_hours)

  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-gray-900">{heading}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <Chip label={t('mood')} value={row.mood_score === null ? null : t('score', { value: row.mood_score })} />
            <Chip label={t('energy')} value={row.energy_level === null ? null : t('score', { value: row.energy_level })} />
            <Chip label={t('sleep')} value={sleep === null || Number.isNaN(sleep) ? null : t('hours', { value: sleep })} />
          </span>
          {symptoms.length > 0 && (
            <span className="mt-1 block truncate text-sm text-gray-500">
              {symptoms.slice(0, 2).map(([key]) => label(key)).join(', ')}
              {symptoms.length > 2 && ` +${symptoms.length - 2}`}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="space-y-3 px-4 pb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700">{t('symptomsHeading')}</h4>
          {symptoms.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">{t('noneRated')}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {symptoms.map(([key, severity]) => (
                <li key={key} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-900">
                  {label(key)} <span className="font-bold">{t('score', { value: severity })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {row.notes && (
          <div>
            <h4 className="text-sm font-medium text-gray-700">{t('notesHeading')}</h4>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-600">{row.notes}</p>
          </div>
        )}
      </div>
    </details>
  )
}

/** A labelled value. The label stays visible: 4/5 alone could be mood or energy. */
function Chip({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
      {label} <span className="font-semibold text-gray-900">{value}</span>
    </span>
  )
}
