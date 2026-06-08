-- 024_bundle_campaign.sql
-- Udvider campaigns-tabellen til at understøtte bundler (uden tidsbegrænsning/rabat)
-- samt tilføjer is_active flag og timestamptz periode-kolonner.

-- 1. record_type: 'bundle' | 'campaign'
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'campaign'
    CHECK (record_type IN ('bundle', 'campaign'));

-- 2. Gør type og discount_type nullable — bundler behøver ikke disse
ALTER TABLE campaigns
  ALTER COLUMN type          DROP NOT NULL,
  ALTER COLUMN discount_type DROP NOT NULL;

-- 3. is_active flag (erstatter status-feltet for den simple aktiv/inaktiv toggle)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 4. Tilføj timestamptz periode-kolonner (parallelt med de eksisterende date-kolonner)
--    starts_at / ends_at bruges til præcis aktiveringstid (frem for blot dato)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at   timestamptz;

-- 5. Migrer eksisterende start_date / end_date til starts_at / ends_at
UPDATE campaigns
SET
  starts_at = start_date::timestamptz,
  ends_at   = end_date::timestamptz
WHERE start_date IS NOT NULL OR end_date IS NOT NULL;

-- 6. discount_pct kolonne som alias for discount_value (procentsats, bruges af nye routes)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS discount_pct numeric;

-- Sync eksisterende procent-kampagner
UPDATE campaigns
SET discount_pct = discount_value
WHERE discount_type = 'percentage' AND discount_value IS NOT NULL;

COMMENT ON COLUMN campaigns.record_type IS 'bundle = produktgruppe uden krav om rabat/datoer; campaign = tidsbestemt tilbud';
COMMENT ON COLUMN campaigns.is_active IS 'Manuel aktiv/inaktiv toggle — uafhængig af starts_at/ends_at';
COMMENT ON COLUMN campaigns.starts_at IS 'Tidspunkt hvorfra bundle/kampagne er aktiv (NULL = ingen begrænsning)';
COMMENT ON COLUMN campaigns.ends_at   IS 'Tidspunkt hvortil bundle/kampagne er aktiv (NULL = ingen slutdato)';
