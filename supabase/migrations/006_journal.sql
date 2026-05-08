-- ============================================================
-- 006_journal.sql
-- Journal entries with structured lifestyle-adjustment tracking
-- ============================================================

CREATE TYPE symptom_key AS ENUM (
  'hot_flashes', 'night_sweats', 'sleep_problems', 'mood_changes',
  'anxiety', 'brain_fog', 'weight_changes', 'joint_pain',
  'low_libido', 'fatigue', 'vaginal_dryness', 'skin_changes',
  'hair_changes', 'other'
);

CREATE TYPE perceived_effect AS ENUM (
  'much_better', 'better', 'no_change', 'worse'
);

CREATE TABLE journal_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Free-text content
  content           TEXT NOT NULL DEFAULT '',
  -- Structured tracking — links this entry to a symptom + plan item
  symptom_focus     symptom_key,
  plan_item_id      TEXT,              -- ID of the wellness plan recommendation being tracked
  plan_item_title   TEXT,             -- Denormalised for display (plan may change)
  days_tried        SMALLINT CHECK (days_tried >= 0),
  perceived_effect  perceived_effect,
  would_continue    BOOLEAN,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own journal entries"
  ON journal_entries FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_journal_entries_user_created
  ON journal_entries(user_id, created_at DESC);

CREATE INDEX idx_journal_entries_symptom
  ON journal_entries(user_id, symptom_focus)
  WHERE symptom_focus IS NOT NULL;

CREATE INDEX idx_journal_entries_plan_item
  ON journal_entries(user_id, plan_item_id)
  WHERE plan_item_id IS NOT NULL;

CREATE TRIGGER journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit only — journal content is sensitive, log existence not content
CREATE OR REPLACE FUNCTION journal_audit_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', auth.uid(),
      jsonb_build_object('id', NEW.id, 'user_id', NEW.user_id, 'created_at', NEW.created_at));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, performed_by, old_data)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', auth.uid(),
      jsonb_build_object('id', OLD.id, 'user_id', OLD.user_id));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER journal_entries_audit
  AFTER INSERT OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_audit_fn();
