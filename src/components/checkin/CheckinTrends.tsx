'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SymptomKey } from '@/types/database'
import { localCalendarDate } from '@/lib/checkin-schema'
import {
  MIN_CHECKINS_FOR_TRENDS,
  TREND_WINDOW_DAYS,
  roundToOneDecimal,
  summariseWindow,
  type HistoryRow,
  type MetricSummary,
} from '@/lib/checkin-history'
import Sparkline from './Sparkline'

/** How many symptoms the frequency list shows. */
const TOP_SYMPTOMS = 5

/**
 * Today's status and the last-30-days summary.
 *
 * A client component because both depend on "today", which must be her
 * device's calendar day: the server runs in UTC and user_preferences.timezone
 * is only captured on push opt-in. "today" is therefore resolved after mount,
 * so server and client render identical markup and nothing hydrates against a
 * different date.
 */
export default function CheckinTrends({ rows }: { rows: HistoryRow[] }) {
  const t = useTranslations('CheckinHistory')
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(localCalendarDate())
  }, [])

  if (today === null) {
    // Same footprint as the loaded state, so the page doesn't jump.
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-gray-100" />
  }

  const loggedToday = rows.some((row) => row.checkin_date === today)
  const summary = summariseWindow(rows, today)

  return (
    <div className="space-y-5">
      <TodayStatus loggedToday={loggedToday} />

      <section
        aria-labelledby="trends-heading"
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="trends-heading" className="font-semibold text-gray-900">
            {t('trendsTitle')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('daysLogged', { count: summary.daysLogged })}
          </p>
        </div>

        {summary.daysLogged < MIN_CHECKINS_FOR_TRENDS ? (
          <p className="mt-3 text-base text-gray-600">{t('notEnoughYet')}</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <MetricTile
                label={t('mood')}
                summary={summary.mood}
                display={(v) => t('scoreAverage', { value: v })}
                values={summary.series.map((p) => p.mood)}
                min={1}
                max={5}
              />
              <MetricTile
                label={t('energy')}
                summary={summary.energy}
                display={(v) => t('scoreAverage', { value: v })}
                values={summary.series.map((p) => p.energy)}
                min={1}
                max={5}
              />
              <MetricTile
                label={t('sleep')}
                summary={summary.sleep}
                display={(v) => t('sleepAverage', { value: v })}
                values={summary.series.map((p) => p.sleep)}
                min={0}
                max={12}
              />
            </dl>

            <TopSymptoms symptoms={summary.symptoms.slice(0, TOP_SYMPTOMS)} />
          </>
        )}

        <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500">
          {t('gpNote')}
        </p>
      </section>
    </div>
  )
}

function TodayStatus({ loggedToday }: { loggedToday: boolean }) {
  const t = useTranslations('CheckinHistory')
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${
        loggedToday ? 'bg-brand-50' : 'bg-brand-900 text-white'
      }`}
    >
      <p className={`text-base font-medium ${loggedToday ? 'text-brand-900' : ''}`}>
        {loggedToday ? t('todayLogged') : t('todayMissing')}
      </p>
      <a
        href="/symptom-checkin"
        className={`inline-flex min-h-11 items-center rounded-xl px-4 text-base font-semibold transition-colors ${
          loggedToday
            ? 'text-brand-700 hover:bg-brand-100'
            : 'bg-white text-brand-900 hover:bg-brand-50'
        }`}
      >
        {loggedToday ? t('editToday') : t('logToday')}
      </a>
    </div>
  )
}

function MetricTile({
  label, summary, display, values, min, max,
}: {
  label: string
  summary: MetricSummary
  display: (_value: number) => string
  values: (number | null)[]
  min: number
  max: number
}) {
  const t = useTranslations('CheckinHistory')
  const average = summary.average === null ? null : roundToOneDecimal(summary.average)

  return (
    <div className="rounded-xl bg-gray-50 p-2">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd>
        {average === null ? (
          <span className="block text-sm text-gray-500">{t('noData')}</span>
        ) : (
          <>
            <span aria-hidden="true" className="block text-sm font-bold text-brand-900">
              {display(average)}
            </span>
            <span className="sr-only">
              {t('metricSummary', { label, value: display(average), count: summary.count })}
            </span>
          </>
        )}
        <Sparkline values={values} min={min} max={max} />
      </dd>
    </div>
  )
}

function TopSymptoms({
  symptoms,
}: {
  symptoms: { key: SymptomKey; days: number; averageSeverity: number }[]
}) {
  const t = useTranslations('CheckinHistory')
  const label = useTranslations('Symptoms')

  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-gray-700">{t('topSymptoms')}</h3>
      {symptoms.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">{t('noSymptoms')}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {symptoms.map((symptom) => (
            <li key={symptom.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900">{label(symptom.key)}</span>
                <span className="text-gray-500">
                  {t('symptomDays', { count: symptom.days })}
                  {' · '}
                  {t('symptomSeverity', { value: roundToOneDecimal(symptom.averageSeverity) })}
                </span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-700"
                  style={{ width: `${(symptom.days / TREND_WINDOW_DAYS) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
