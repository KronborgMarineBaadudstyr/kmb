-- Migration 035: shop_product_search()
-- Full-text shop search across name, EAN, SKU, brand, description, manufacturer_sku.
-- Returns product IDs sorted by relevance, for use in the shop search API.

CREATE OR REPLACE FUNCTION shop_product_search(search_term text)
RETURNS TABLE(id uuid, relevance int)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (p.id)
    p.id,
    CASE
      WHEN p.ean              ILIKE search_term             THEN 100
      WHEN p.internal_sku     ILIKE search_term             THEN 90
      WHEN p.manufacturer_sku ILIKE search_term             THEN 90
      WHEN p.name             ILIKE search_term             THEN 80
      WHEN p.brand            ILIKE search_term             THEN 60
      WHEN p.ean              ILIKE '%' || search_term || '%' THEN 50
      WHEN p.internal_sku     ILIKE '%' || search_term || '%' THEN 45
      WHEN p.manufacturer_sku ILIKE '%' || search_term || '%' THEN 45
      WHEN p.name             ILIKE '%' || search_term || '%' THEN 40
      WHEN p.brand            ILIKE '%' || search_term || '%' THEN 30
      ELSE 10
    END AS relevance
  FROM products p
  LEFT JOIN product_suppliers ps ON ps.product_id = p.id
  WHERE p.status NOT IN ('archived', 'rejected')
    AND (
      p.name             ILIKE '%' || search_term || '%'
      OR p.ean           ILIKE '%' || search_term || '%'
      OR p.internal_sku  ILIKE '%' || search_term || '%'
      OR p.manufacturer_sku ILIKE '%' || search_term || '%'
      OR p.brand         ILIKE '%' || search_term || '%'
      OR ps.supplier_sku ILIKE '%' || search_term || '%'
    )
  ORDER BY p.id, relevance DESC;
$$;
