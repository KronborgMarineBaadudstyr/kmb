-- Migration 008: HF Industri Marine leverandør
INSERT INTO suppliers (name, data_format, sync_interval_hours, active, notes, field_mapping)
VALUES (
  'HF Industri Marine',
  'excel',
  8760, -- Manuelt upload — ingen automatisk sync
  true,
  'Manuelt upload af XLSX-prisliste. Ark-navne bruges som produktkategorier.',
  '{"match_on":[{"supplier_field":"ean","supabase_field":"products.ean","confidence":"high"}]}'::jsonb
)
;
