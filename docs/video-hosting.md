# Video hosting (Cloudflare Stream)

Videos are hosted on Cloudflare Stream. The app decides who may watch each one.

## How it works

- `videos` table (migration 036): one row per video, each with a **key** (`slug`, e.g. `welcome`), a title, who can watch (`public` / `signed_in` / `premium`), and its processing status.
- Every Stream video is created with **`requireSignedURLs`**. A Stream video ID on its own plays nothing.
- `GET /api/videos/[slug]/playback` is the only place a playback token is signed, and it signs one only after `canWatch()` allows the viewer. Tokens expire after 4 hours.
- Pages show a video by key: `<StreamVideo slug="welcome" />` (`src/components/video/StreamVideo.tsx`). A key with no ready video shows nothing, so you can place a slot before its video exists.
- Admins upload, link and change access at **/admin/videos**. Files up to 200 MB go straight from the browser to Cloudflare. For larger files, upload them in the Cloudflare dashboard, then use "Link an existing video". Linking also makes the video private.
- `POST /api/stream/webhook` marks videos ready (HMAC-verified). "Check status" in the admin does the same thing on demand.

## One-time setup (all in the browser)

1. **Cloudflare:** subscribe to Stream (Images & Stream → Plans). Then create an API token: Profile → API Tokens → Create Token → Custom. Grant **Account › Stream › Edit**, scoped to this account.
2. **Supabase:** run `supabase/migrations/036_videos.sql` in the SQL Editor.
3. **Vercel → Settings → Environment Variables** (Production and Preview). Add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` and `CLOUDFLARE_STREAM_CUSTOMER_CODE` (the code in `customer-<code>.cloudflarestream.com`, shown on the Stream page). Then redeploy.
4. **Live site → /admin/videos → "Set up video hosting".** This creates the signing key and registers the webhook (pointed at `NEXT_PUBLIC_APP_URL/api/stream/webhook`), then shows the remaining values **once**. Add them to Vercel and redeploy.
5. **Verify:** upload a short video in /admin/videos. Once it shows **Ready**, click **Test playback security**. It must report "refused without a token, plays with one". Don't put a video on a page until it does.

/admin → Env diagnostics lists any variable that is missing.

**Terminal alternative:** `npx tsx scripts/stream-setup.ts all --app-url https://auntymel.app --test-video ./clip.mp4` does steps 4–5 from a laptop. It's safe to re-run, and `--dry-run` changes nothing.

## Before the first video goes live

- **Privacy notice.** Cloudflare becomes a new data processor: the player receives each viewer's IP address. Add it to section 4 of `src/app/privacy/page.tsx`, with wording and location reviewed by whoever owns the privacy policy.
- **Captions.** Every video needs captions for accessibility. Stream supports uploaded caption files and auto-generated captions.
