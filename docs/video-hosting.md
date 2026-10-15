# Video hosting (Cloudflare Stream)

Videos are hosted on Cloudflare Stream. The app decides who may watch each one.

## How it works

- `videos` table (migration 036): one row per video, each with a **key** (`slug`, e.g. `welcome`), a title, who can watch (`public` / `signed_in` / `premium`), and its processing status.
- Every Stream video is created with **`requireSignedURLs`**. A Stream video ID on its own plays nothing.
- `GET /api/videos/[slug]/playback` is the only place a playback token is signed, and it signs one only after `canWatch()` allows the viewer. Tokens expire after 4 hours.
- Pages show a video by key: `<StreamVideo slug="welcome" />` (`src/components/video/StreamVideo.tsx`). A key with no ready video shows nothing, so you can place a slot before its video exists.
- Admins upload, link and change access at **/admin/videos**. Files up to 200 MB go straight from the browser to Cloudflare. For larger files, upload them in the Cloudflare dashboard, then use "Link an existing video". Linking also makes the video private.
- `POST /api/stream/webhook` marks videos ready (HMAC-verified). "Check status" in the admin does the same thing on demand.

## One-time setup

1. **Turn on Stream.** In the Cloudflare dashboard, go to **Stream**, subscribe, and pick a storage plan.
2. **Account ID → `CLOUDFLARE_ACCOUNT_ID`.** It's shown on the account overview page.
3. **Customer code → `CLOUDFLARE_STREAM_CUSTOMER_CODE`.** Open Stream → any video → embed code. Copy the part between `customer-` and `.cloudflarestream.com`.
4. **API token → `CLOUDFLARE_STREAM_API_TOKEN`.** Go to My Profile → API Tokens → Create Token → Custom. Grant the **Account › Stream › Edit** permission, scoped to this account only.
5. Put those four values in `.env.local`, then run:
   ```sh
   npm run stream-setup -- signing-key
   npm run stream-setup -- webhook https://auntymel.app/api/stream/webhook
   ```
   These print `CLOUDFLARE_STREAM_SIGNING_KEY_ID`, `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` and `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
6. Add all six variables in Vercel (Production and Preview), then redeploy.
7. Apply migration `036_videos.sql`.
8. **Verify end to end.** Upload a short test video in /admin/videos and wait for **Ready**. Then run:
   ```sh
   npm run stream-setup -- check <stream-video-id>
   ```
   It must report that the video is refused **without** a token and loads **with** one. Don't put a video on a page until this passes.

/admin → Env diagnostics lists any variable that is missing.

## Before the first video goes live

- **Privacy notice.** Cloudflare becomes a new data processor: the player receives each viewer's IP address. Add it to section 4 of `src/app/privacy/page.tsx`, with wording and location reviewed by whoever owns the privacy policy.
- **Captions.** Every video needs captions for accessibility. Stream supports uploaded caption files and auto-generated captions.
