-- Migration 067: Butiksoplysninger (Indstillinger → Butiksoplysninger, /admin/butik)
-- Firmanavn, CVR, adresse, kontakt, åbningstider, leveringstid og returregler.
-- Bruges af handelsbetingelserne (/handelsbetingelser), sidefoden, kvitteringen og ordremails.
-- Én række (id = 'store'); data er et jsonb-objekt, så nye felter ikke kræver migration.

CREATE TABLE IF NOT EXISTS store_settings (
  id          text        PRIMARY KEY DEFAULT 'store' CHECK (id = 'store'),
  data        jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_settings FROM anon, authenticated;
GRANT ALL ON store_settings TO service_role;
