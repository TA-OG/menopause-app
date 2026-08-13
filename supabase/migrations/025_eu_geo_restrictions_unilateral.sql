-- ============================================================
-- 025_eu_geo_restrictions_unilateral.sql
-- EU non-discrimination: geo_restrictions.mode for every EU member state
-- must move together. EU law (the Geo-blocking Regulation and the wider
-- non-discrimination principle for services across the internal market)
-- means we cannot offer the app on different terms to residents of
-- different EU countries. If one EU country is Off, Info Only, or Live,
-- every EU country must be the same.
--
-- Non-EU jurisdictions (GB, NO, CH, US, etc.) are unaffected and keep
-- their existing independent per-country control.
-- ============================================================

ALTER TABLE geo_restrictions ADD COLUMN is_eu BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN geo_restrictions.is_eu IS
  'EU member state. All is_eu=TRUE rows are kept in lockstep on mode by '
  'trg_sync_eu_geo_restrictions — EU non-discrimination law forbids treating '
  'one member state differently from another.';

UPDATE geo_restrictions SET is_eu = TRUE
WHERE country_code IN (
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
);

-- Sanity check: exactly the 27 EU member states, no more, no less.
DO $$
DECLARE eu_count INT;
BEGIN
  SELECT COUNT(*) INTO eu_count FROM geo_restrictions WHERE is_eu;
  IF eu_count <> 27 THEN
    RAISE EXCEPTION 'Expected 27 EU member states flagged is_eu, found %. Check geo_restrictions seed data (018, 021).', eu_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Enforce lockstep: whenever an EU row's mode changes (or a new EU row is
-- inserted), cascade that mode to every other EU row in one follow-up
-- UPDATE. pg_trigger_depth() = 1 ensures we only cascade from the
-- originating change, not from the cascade's own UPDATE — so this runs in
-- exactly two statements total, no recursive blow-up.
--
-- This makes divergent EU modes structurally impossible, including via
-- direct DB edits or any future write path — not just the admin API.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_eu_geo_restrictions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_eu
     AND pg_trigger_depth() = 1
     AND (TG_OP = 'INSERT' OR NEW.mode IS DISTINCT FROM OLD.mode) THEN
    UPDATE geo_restrictions
    SET mode = NEW.mode,
        enabled = NEW.enabled,
        updated_at = NEW.updated_at,
        updated_by = NEW.updated_by
    WHERE is_eu = TRUE
      AND country_code <> NEW.country_code
      AND mode IS DISTINCT FROM NEW.mode;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_eu_geo_restrictions ON geo_restrictions;

CREATE TRIGGER trg_sync_eu_geo_restrictions
AFTER INSERT OR UPDATE ON geo_restrictions
FOR EACH ROW
EXECUTE FUNCTION public.sync_eu_geo_restrictions();
