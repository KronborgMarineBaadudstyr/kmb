-- Migration 007: Columbus Marine leverandør
INSERT INTO suppliers (name, data_format, sync_interval_hours, active, notes, field_mapping)
VALUES (
  'Columbus Marine',
  'ftp',
  24,
  true,
  'FTP XML-prisliste. Henter ColumbusStock.xml fra /V30/. Credentials sættes separat via supabase/local/columbus_credentials.sql.',
  '{"match_on":[{"supplier_field":"ean","supabase_field":"products.ean","confidence":"high"}]}'::jsonb
)
;
