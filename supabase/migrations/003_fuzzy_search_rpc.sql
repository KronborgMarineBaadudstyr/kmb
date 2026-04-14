-- ============================================================
-- Migration 003: fuzzy_product_search RPC
-- Kræver pg_trgm extension + idx_products_name_trgm (migration 002)
-- ============================================================

CREATE OR REPLACE FUNCTION fuzzy_product_search(
  search_name text,
  min_score   float DEFAULT 0.35
)
RETURNS TABLE (
  id            uuid,
  name          text,
  internal_sku  text,
  score         float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    name,
    internal_sku,
    similarity(name, search_name)::float AS score
  FROM products
  WHERE similarity(name, search_name) >= min_score
  ORDER BY score DESC
  LIMIT 10;
$$;
