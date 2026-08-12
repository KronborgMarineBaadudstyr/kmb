-- Migration 040: Backfill sales_price på produkter der mangler det
-- Henter recommended_sales_price fra den laveste-priority product_suppliers række
-- Køres manuelt i Supabase SQL Editor.

UPDATE products p
SET sales_price = ps.recommended_sales_price,
    updated_at  = now()
FROM (
  SELECT DISTINCT ON (product_id)
    product_id,
    recommended_sales_price
  FROM product_suppliers
  WHERE recommended_sales_price IS NOT NULL
    AND recommended_sales_price > 0
  ORDER BY product_id, priority ASC
) ps
WHERE p.id = ps.product_id
  AND p.sales_price IS NULL;

-- Resultat
SELECT
  COUNT(*) FILTER (WHERE sales_price IS NOT NULL) AS med_pris,
  COUNT(*) FILTER (WHERE sales_price IS NULL)     AS uden_pris,
  COUNT(*)                                         AS total
FROM products;
