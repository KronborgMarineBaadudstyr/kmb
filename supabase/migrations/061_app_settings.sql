-- Migration 061: Indstillinger med hemmelige værdier (fx butikkens egen Anthropic-nøgle)
-- value er krypteret i appen (AES-256-GCM, lib/secrets.ts) — databasen ser aldrig nøglen i klartekst.

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,               -- fx 'anthropic_api_key'
  value      text NOT NULL,                  -- krypteret
  hint       text,                           -- fx sidste 4 tegn, til visning
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_settings FROM anon, authenticated;
GRANT ALL ON app_settings TO service_role;
