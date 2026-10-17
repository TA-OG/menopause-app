-- ============================================================
-- 036_videos.sql
-- Video hosting on Cloudflare Stream.
--
-- Video is going to be part of several user flows (the welcome page first,
-- then others), so this is one shared library rather than something bolted
-- onto Learn articles. A page asks for a video by its `slug` — a stable key
-- such as 'welcome' — so the video behind a slot can be replaced in
-- /admin/videos without a code change.
--
-- The video files themselves live in Cloudflare Stream. This table holds what
-- the app decides: what each video is called, who may watch it, and whether
-- Stream has finished processing it.
--
-- Access is enforced by the app, not by RLS. Every Stream video is created
-- with requireSignedURLs, so nothing plays without a short-lived token, and
-- the only thing that signs tokens is GET /api/videos/[slug]/playback after
-- it has checked `access` against the viewer (src/lib/stream.ts, canWatch).
-- ============================================================

CREATE TYPE video_access AS ENUM (
  'public',     -- anyone, signed in or not (e.g. the welcome video on /)
  'signed_in',  -- any signed-in user, free or premium
  'premium'     -- premium users (admins resolve to premium in access.ts)
);

CREATE TYPE video_status AS ENUM (
  'awaiting_upload',  -- upload URL issued, no file received yet
  'processing',       -- Stream is encoding it
  'ready',            -- readyToStream: playable
  'error'             -- Stream could not process it; see error_reason
);

CREATE TABLE videos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Stable key pages use to ask for this video: <StreamVideo slug="welcome" />.
  slug             TEXT NOT NULL UNIQUE
                   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),

  -- Cloudflare Stream video id (32 lowercase hex characters).
  stream_uid       TEXT NOT NULL UNIQUE CHECK (stream_uid ~ '^[a-f0-9]{32}$'),

  -- Defaults to the most restrictive level so a video that is created
  -- without a deliberate choice is never accidentally public.
  access           video_access NOT NULL DEFAULT 'premium',

  status           video_status NOT NULL DEFAULT 'awaiting_upload',
  error_reason     TEXT,
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE videos IS
  'Videos hosted on Cloudflare Stream. Read and written only through the '
  'service role: /admin/videos, the Stream webhook, and the playback route, '
  'which applies `access` before signing a token.';

CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- No policies, deliberately. Neither `anon` nor `authenticated` can read or
-- write this table; every access goes through a server route using the
-- service role. A reader policy here would add nothing — the Stream id alone
-- cannot play a video — and would expose the full library, drafts and
-- premium titles included, to any signed-in client.
