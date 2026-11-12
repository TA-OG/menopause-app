import { pageTitle } from '@/lib/page-meta'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { recordEvent } from '@/lib/monitoring'
import {
  HISTORY_COLUMNS,
  HISTORY_PAGE_SIZE,
  parseBeforeCursor,
  type HistoryRow,
} from '@/lib/checkin-history'
import CheckinTrends from '@/components/checkin/CheckinTrends'
import CheckinHistoryList from '@/components/checkin/CheckinHistoryList'

/**
 * Check-in history — what she has logged and how it is changing.
 *
 * Check-ins used to be write-only: the form loaded today's entry and nothing
 * read the rest, while the dashboard promised she could "see your progress
 * over time". This page is that promise: today's status, a last-30-days
 * summary, and every check-in, newest first.
 *
 * Reads through the user-scoped client, so the "Users can manage own
 * checkins" RLS policy (migration 004) applies on top of the user_id filter.
 *
 * Paged by a `before` date cursor rather than an offset, so a check-in saved
 * while she is reading can never shift a day onto two pages or off both.
 * The first page's rows also feed the trend summary: they are her newest
 * HISTORY_PAGE_SIZE check-ins, and checkin_date is unique per user, so they
 * contain every check-in in the 30-day window.
 */
export async function generateMetadata() {
  return pageTitle('CheckinHistory')
}

export default async function CheckinHistoryPage({
  searchParams,
}: {
  searchParams: { before?: string | string[]; saved?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?redirectTo=/symptom-checkin/history')

  const t = await getTranslations('CheckinHistory')
  const before = parseBeforeCursor(searchParams.before)

  let query = supabase
    .from('symptom_checkins')
    .select(HISTORY_COLUMNS)
    .eq('user_id', user.id)
  if (before) query = query.lt('checkin_date', before)

  // One extra row tells us whether an older page exists, without a count query.
  const { data, error } = await query
    .order('checkin_date', { ascending: false })
    .limit(HISTORY_PAGE_SIZE + 1)

  if (error) {
    await recordEvent({
      type: 'error', route: '/symptom-checkin/history', method: 'GET', status: 500,
      message: error.message, userId: user.id,
    })
  }

  const fetched = (data ?? []) as HistoryRow[]
  const hasOlder = fetched.length > HISTORY_PAGE_SIZE
  const rows = fetched.slice(0, HISTORY_PAGE_SIZE)
  const isFirstPage = before === null
  const oldestShown = rows[rows.length - 1]?.checkin_date

  return (
    <div className="space-y-5 py-4">
      <div>
        <a
          href="/symptom-checkin"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700"
        >
          {t('backToCheckin')}
        </a>
        <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-base text-gray-600">{t('subtitle')}</p>
      </div>

      {searchParams.saved === '1' && isFirstPage && !error && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-base font-medium text-brand-900">
          ✓ {t('saved')}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-700">
          {t('loadError')}
        </p>
      )}

      {!error && isFirstPage && rows.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">{t('emptyTitle')}</h2>
          <p className="mt-1 text-base text-gray-600">{t('emptyBody')}</p>
          <a
            href="/symptom-checkin"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-900 px-4 text-base font-semibold text-white transition-colors hover:bg-brand-800"
          >
            {t('emptyCta')}
          </a>
        </div>
      )}

      {!error && isFirstPage && rows.length > 0 && <CheckinTrends rows={rows} />}

      {rows.length > 0 && (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="font-bold text-brand-900">
            {t('historyTitle')}
          </h2>
          <CheckinHistoryList rows={rows} />
        </section>
      )}

      {(hasOlder || !isFirstPage) && (
        <nav aria-label={t('historyTitle')} className="flex flex-wrap justify-between gap-3">
          {!isFirstPage && (
            <a
              href="/symptom-checkin/history"
              className="inline-flex min-h-11 items-center text-base font-medium text-brand-700"
            >
              {t('newest')}
            </a>
          )}
          {hasOlder && oldestShown && (
            <a
              href={`/symptom-checkin/history?before=${oldestShown}`}
              className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-brand-200 px-4 text-base font-medium text-brand-700 hover:bg-brand-50"
            >
              {t('older')}
            </a>
          )}
        </nav>
      )}
    </div>
  )
}
