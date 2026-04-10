-- ============================================================
-- Migration 002: Leverandør staging + field mapping + unit
-- ============================================================

-- Trigram extension til fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Tilføj unit-felter til products ──
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit       text,   -- meter / styk / pose / rulle / liter / kg / sæt / par
  ADD COLUMN IF NOT EXISTS unit_size  numeric; -- antal pr. salgsenhed (fx 120 for en 120m spole)

-- ── Tilføj field_mapping til suppliers ──
-- Definerer: hvilke leverandørfelter matches mod Supabase-felter (til linking),
-- hvilke kopieres til products, og hvilke kopieres til product_suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS field_mapping jsonb;

-- ── Staging-tabel for leverandørprodukter der ikke er matchet ──
CREATE TABLE IF NOT EXISTS supplier_product_staging (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  import_run_id       uuid,   -- reference til supplier_imports.id (når vi bruger den)

  -- Rå data præcis som den kom fra leverandøren
  raw_data            jsonb NOT NULL,

  -- Normaliserede felter (efter field_mapping er anvendt)
  normalized_name     text,
  normalized_ean      text,
  normalized_sku      text,
  normalized_unit     text,
  normalized_unit_size numeric,

  -- Fuzzy match-forslag mod eksisterende produkter
  -- [{product_id, product_name, score, match_field}]
  match_suggestions   jsonb NOT NULL DEFAULT '[]',

  -- Status i godkendelsesflow
  status              text NOT NULL DEFAULT 'pending_review',
  -- pending_review: afventer manuel gennemgang
  -- matched:        manuelt matchet til eksisterende produkt
  -- new_product:    godkendt som nyt draft-produkt
  -- rejected:       afvist (duplikat, fejl osv.)

  -- Hvis manuelt matchet til eksisterende produkt
  matched_product_id  uuid REFERENCES products(id) ON DELETE SET NULL,

  -- Hvilke felter vindes af leverandøren vs. vores egne data
  -- {"name":"existing","description":"supplier","unit":"supplier",...}
  field_resolution    jsonb,

  -- Metadata
  reviewed_by         text,
  reviewed_at         timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Unik pr. leverandør + leverandørens SKU (forhindrer dubletter på tværs af imports)
  CONSTRAINT uq_staging_supplier_sku UNIQUE (supplier_id, normalized_sku),

  CONSTRAINT staging_status_check
    CHECK (status IN ('pending_review','matched','new_product','rejected'))
);

CREATE INDEX IF NOT EXISTS idx_staging_supplier_id  ON supplier_product_staging(supplier_id);
CREATE INDEX IF NOT EXISTS idx_staging_status       ON supplier_product_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_name_trgm    ON supplier_product_staging USING gin(normalized_name gin_trgm_ops);

-- Trigram index på products.name til fuzzy matching
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- ── Opdater Engholm field_mapping ──
UPDATE suppliers
SET field_mapping = '{
  "match_on": [
    {"supplier_field": "gtin",  "supabase_field": "products.ean",              "confidence": "high"},
    {"supplier_field": "sku",   "supabase_field": "products.manufacturer_sku", "confidence": "medium"}
  ],
  "map_to_products": {
    "title":       "name",
    "description": "description",
    "gtin":        "ean",
    "retail":      "sales_price",
    "image":       "_image"
  },
  "map_to_product_suppliers": {
    "sku":    "supplier_sku",
    "title":  "supplier_product_name",
    "price":  "purchase_price",
    "retail": "recommended_sales_price",
    "stock":  "supplier_stock_quantity"
  },
  "unit_field":      "unit",
  "unit_size_from":  "details"
}'::jsonb
WHERE name = 'Engholm';
