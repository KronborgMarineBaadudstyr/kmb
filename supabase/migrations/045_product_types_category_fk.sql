-- Migration 045: Kobl product_types til categories tabel
-- Tilføjer category_id FK så produkttyper hører til én DB-kategori

ALTER TABLE product_types
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_types_category_id ON product_types (category_id);

-- Backfill: match our_category navn mod categories.name
UPDATE product_types pt
SET    category_id = c.id
FROM   categories c
WHERE  pt.our_category IS NOT NULL
  AND  lower(trim(pt.our_category)) = lower(c.name)
  AND  pt.category_id IS NULL;
