-- ============================================================
-- 017_intake_documents.sql
-- Source documents & external references for content intake.
--
-- Alongside the plain-English questionnaire (016), Pamela uploads
-- her own studies, papers and written documents as raw source
-- material. These often carry her *personal company* branding
-- (not Aunty Mel), which is captured as a note and stripped during
-- the human/Claude authoring step — the files themselves are never
-- shown to users. Separately, external citations (studies and
-- publications that back her claims) are recorded so the app stays
-- an externally-verified info source.
--
-- Like content_intake_responses, these are raw inputs consumed
-- later by the authoring pipeline — there is no runtime use.
-- ============================================================

-- ─── Private storage bucket for uploaded source files ──────────────────────
-- public = false: files are reachable only via short-lived signed URLs minted
-- server-side by the service-role admin client. No anonymous/public access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('intake-sources', 'intake-sources', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ─── Uploaded source documents ─────────────────────────────────────────────
CREATE TABLE content_intake_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Nullable: a document can be general (not tied to a single topic).
  topic_id      TEXT,
  topic_label   TEXT,
  file_name     TEXT NOT NULL,                 -- original name, for display only
  storage_path  TEXT NOT NULL UNIQUE,          -- randomised key in intake-sources
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  source_note   TEXT,                          -- what it is / where it came from
  branding_note TEXT,                          -- company branding to strip (sanitisation flag)
  status        TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'reviewed', 'archived')),
  round         TEXT NOT NULL DEFAULT 'foundation',
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_intake_documents ENABLE ROW LEVEL SECURITY;

-- Author-only data. Only the service role (used by the admin tooling behind
-- the is_admin layout gate) may read or write it.
CREATE POLICY "Service role manages intake documents"
  ON content_intake_documents FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX idx_intake_documents_topic ON content_intake_documents(topic_id);
CREATE INDEX idx_intake_documents_status ON content_intake_documents(status);

CREATE TRIGGER content_intake_documents_updated_at
  BEFORE UPDATE ON content_intake_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── External references / citations ───────────────────────────────────────
CREATE TABLE content_intake_references (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Optionally tied to a document and/or a topic; either may be NULL.
  document_id  UUID REFERENCES content_intake_documents(id) ON DELETE CASCADE,
  topic_id     TEXT,
  title        TEXT NOT NULL,
  authors      TEXT,
  publication  TEXT,                           -- journal / publisher
  year         INT,
  url          TEXT,
  doi          TEXT,
  notes        TEXT,                            -- what claim this supports
  added_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_intake_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages intake references"
  ON content_intake_references FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX idx_intake_references_topic ON content_intake_references(topic_id);
CREATE INDEX idx_intake_references_document ON content_intake_references(document_id);

CREATE TRIGGER content_intake_references_updated_at
  BEFORE UPDATE ON content_intake_references
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
