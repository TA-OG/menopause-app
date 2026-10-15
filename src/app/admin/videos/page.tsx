import { createAdminClient } from '@/lib/supabase/admin'
import { VIDEO_COLUMNS, type VideoRow } from '@/lib/stream'
import VideoManager from './VideoManager'
import StreamSetupPanel from './StreamSetupPanel'

/**
 * Video library — every video the app can show, wherever it appears.
 *
 * Reads through the service-role client: `videos` has no RLS policies at all
 * (036), so nothing else can see it.
 */

export const dynamic = 'force-dynamic'

const REQUIRED_ENV = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_STREAM_API_TOKEN',
  'CLOUDFLARE_STREAM_CUSTOMER_CODE',
  'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
  'CLOUDFLARE_STREAM_SIGNING_KEY_PEM',
  'CLOUDFLARE_STREAM_WEBHOOK_SECRET',
]

export default async function VideosPage() {
  const { data, error } = await createAdminClient()
    .from('videos')
    .select(VIDEO_COLUMNS)
    .order('updated_at', { ascending: false })

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Could not load the videos: {error.message}
      </div>
    )
  }

  // Names only — never values.
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-brand-900">Videos</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Every video used anywhere in the app. Each one has a key (for example{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">welcome</code>) that a page uses to
          show it, so you can replace the video behind a key without any code changes.
          Videos are hosted on Cloudflare Stream and only play through the app.
        </p>
      </div>

      {missingEnv.length > 0 && (
        <StreamSetupPanel
          missing={missingEnv}
          canRun={!!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_STREAM_API_TOKEN}
        />
      )}

      <VideoManager initialVideos={(data ?? []) as VideoRow[]} />
    </div>
  )
}
