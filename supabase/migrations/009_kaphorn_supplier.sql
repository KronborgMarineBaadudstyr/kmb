-- Migration 009: Kap-Horn leverandør
INSERT INTO suppliers (name, data_format, sync_interval_hours, active, notes, field_mapping)
VALUES (
  'Kap-Horn',
  'ftp',
  8760, -- productfeed opdateres kun ved sæsonskift; ballag har daglig cron
  true,
  'FTP XML. productfeed.xml (produkter + spec-PDFs, sæsonmæssig opdatering), ballag.xml (daglig lagerstatus, bucketed: 0/4/10/25+). Vejl. pris er inkl. moms — gemmes ekskl. 25% moms.',
  '{"match_on":[{"supplier_field":"ean13","supabase_field":"products.ean","confidence":"high"}]}'::jsonb
)
;
