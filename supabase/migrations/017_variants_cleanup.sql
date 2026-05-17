-- Migration 017: Convert wrongly-created variant products → product_variants rows
--
-- Background: Products that are variants were stored as separate rows in `products`
-- with parent_product_id set (migration 016 approach). The correct schema uses the
-- `product_variants` table (product_id → parent, attributes jsonb).
-- `product_suppliers` already has a `variant_id` column for per-variant supplier links.
--
-- This migration:
--   1. Converts products.variant_attributes {key:val} → product_variants.attributes [{name,value}]
--   2. Moves product_suppliers rows from variant-products to parent, setting variant_id
--   3. Deletes the now-redundant variant product rows
--   4. Drops parent_product_id + variant_attributes columns from products (no longer needed)

BEGIN;

-- ── Step 1: Insert product_variants rows from variant products ─────────────────
INSERT INTO product_variants (
  product_id,
  internal_variant_sku,
  attributes,
  ean,
  sales_price,
  sale_price,
  own_stock_quantity,
  own_stock_reserved,
  status,
  created_at,
  updated_at
)
SELECT
  p.parent_product_id                           AS product_id,
  p.internal_sku                                AS internal_variant_sku,
  -- Convert {"Størrelse":"L","Farve":"Rød"} → [{name:"Størrelse",value:"L"},...]
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('name', kv.key, 'value', kv.value))
     FROM jsonb_each_text(p.variant_attributes) kv),
    '[]'::jsonb
  )                                             AS attributes,
  p.ean,
  p.sales_price,
  p.sale_price,
  p.own_stock_quantity,
  p.own_stock_reserved,
  CASE WHEN p.status = 'published' THEN 'active' ELSE 'active' END AS status,
  p.created_at,
  p.updated_at
FROM products p
WHERE p.parent_product_id IS NOT NULL;

-- ── Step 2: Move product_suppliers from variant-products to parent ─────────────
-- Re-point product_id to the parent and set variant_id to the new product_variants row
UPDATE product_suppliers ps
SET
  product_id = p.parent_product_id,
  variant_id = pv.id
FROM products p
JOIN product_variants pv
  ON pv.internal_variant_sku = p.internal_sku
 AND pv.product_id = p.parent_product_id
WHERE ps.product_id = p.id
  AND p.parent_product_id IS NOT NULL;

-- ── Step 3: Delete variant product rows (now redundant) ────────────────────────
-- product_images, product_files on these rows are also deleted via CASCADE
DELETE FROM products
WHERE parent_product_id IS NOT NULL;

-- ── Step 4: Remove variant-hierarchy columns from products ─────────────────────
-- (no longer needed — product_variants is the canonical place)
ALTER TABLE products
  DROP COLUMN IF EXISTS parent_product_id,
  DROP COLUMN IF EXISTS variant_attributes;

COMMIT;
