-- 028_category_attribute_filters.sql
-- Konfigurerer hvilke variant-attributter der bruges som søgefiltre per kategori.
-- Fx: kategori "Ankerkæder" → attribut "Diameter" → søgefilter = true
--     kategori "Maling"     → attribut "Farve"    → søgefilter = true
-- Bruges ved WooCommerce-sync til at sætte korrekte attribute-flags per kategori.

CREATE TABLE IF NOT EXISTS category_attribute_filters (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text        NOT NULL,
  attribute_name text        NOT NULL,
  filter_label   text,                             -- visningsnavn i shop (fx "Diameter (mm)")
  use_for_search boolean     NOT NULL DEFAULT true,
  position       integer     NOT NULL DEFAULT 0,   -- sorteringsrækkefølge i filterpanel
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, attribute_name)
);

COMMENT ON TABLE  category_attribute_filters IS 'Per-kategori konfiguration af variant-attributter som søgefiltre';
COMMENT ON COLUMN category_attribute_filters.use_for_search IS 'Om attributten vises som søgefilter i kategorien (WooCommerce layered nav)';
COMMENT ON COLUMN category_attribute_filters.filter_label   IS 'Visningsnavn i shopfilter — falder tilbage til attribute_name hvis null';
