-- 027_original_number.sql
-- Tilføjer original_number og original_number_source til products.
-- original_number er det eksternt synlige varenummer der vises på varer, i shop mv.
-- Kan sættes til hvad som helst: EAN, internt SKU, producent-nr., leverandør-SKU osv.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS original_number        text,
  ADD COLUMN IF NOT EXISTS original_number_source text;

COMMENT ON COLUMN products.original_number        IS 'Eksternt synligt varenummer — vises på vare, i shop mv. (kan være EAN, SKU, producent-nr., leverandør-SKU mv.)';
COMMENT ON COLUMN products.original_number_source IS 'Kilde-felt for original_number (fx: internal_sku, ean, manufacturer_sku, supplier_sku:<id>, variant_sku:<id>, manual)';
