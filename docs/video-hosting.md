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

Two things need a person in the Cloudflare dashboard:

1. **Subscribe to Stream** (dashboard → Stream). This is billing, so it can't be scripted.
2. **Create an API token.** Go to My Profile → API Tokens → Create Token → Custom. Grant **Account › Stream › Edit**, scoped to this account only.

Everything else is one command, run from the repo root with a short test clip of 200 MB or less:

```sh
npm run stream-setup -- all --app-url https://auntymel.app --test-video ./clip.mp4
```

It asks for the token if `CLOUDFLARE_STREAM_API_TOKEN` isn't set, then:

- finds the account
- checks that Stream is enabled
- creates the signing key
- registers the webhook
- writes all six variables to `.env.local`
- checks that migration 036 is applied
- uploads the clip, proves it's **refused without** a token and **plays with** one, then deletes it
- pushes the variables to Vercel (Production and Preview)

You can re-run it safely: anything already configured is checked and kept, not recreated. Add `--dry-run` to see what it would do without changing anything.

- **Vercel push:** set `VERCEL_TOKEN` (vercel.com/account/tokens) and run `vercel link` once first. Without them, the script tells you to add the values by hand.
- **Migration:** the script checks it but doesn't apply it. Apply `036_videos.sql` the same way as earlier migrations.
- **After the variables are in:** redeploy.

Don't put a video on a page until the end-to-end check passes. /admin → Env diagnostics lists any variable that is missing.

## Before the first video goes live

- **Privacy notice.** Cloudflare becomes a new data processor: the player receives each viewer's IP address. Add it to section 4 of `src/app/privacy/page.tsx`, with wording and location reviewed by whoever owns the privacy policy.
- **Captions.** Every video needs captions for accessibility. Stream supports uploaded caption files and auto-generated captions.
