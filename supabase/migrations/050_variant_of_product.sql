-- Migration 050: variant_of_product_id på products
-- Markerer at et produkt er "suget ind" i et parent som variant.
-- Sådanne produkter skjules fra shop-grids og admin-oversigter.

-- 1. Tilføj kolonne
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_of_product_id uuid
    REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_variant_of
  ON products(variant_of_product_id)
  WHERE variant_of_product_id IS NOT NULL;

-- 2. Constraint: et produkt kan ikke være parent for sig selv
ALTER TABLE products
  ADD CONSTRAINT products_no_self_variant
    CHECK (variant_of_product_id IS DISTINCT FROM id);

-- Bemærk: Et produkt der ER parent (dvs. andre har variant_of_product_id = dette id)
-- må ikke selv have variant_of_product_id sat.
-- Dette håndhæves i applikationslaget (API) ikke på DB-niveau,
-- da en CHECK constraint ikke kan lave subqueries i Postgres.
