-- Migration 063: Hurtigere kategorier i shoppen
-- 1. GIN-index på products.categories — bruges af .contains('categories', [...]) på kategorisider og "Flere i …"
-- 2. product_category_counts(): alle brugte kategorier med antal produkter i ét kald.
--    Erstatter at hente alle produkters kategorier til appen (langsomt, og Supabase giver kun 1000 rækker pr. kald)

CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING gin (categories);

CREATE OR REPLACE FUNCTION product_category_counts()
RETURNS TABLE(name text, product_count int)
LANGUAGE sql STABLE AS $$
  SELECT c AS name, count(*)::int AS product_count
  FROM products, unnest(categories) AS c
  WHERE status NOT IN ('archived', 'rejected')
    AND c IS NOT NULL AND c <> ''
  GROUP BY c
  ORDER BY count(*) DESC, c
$$;

REVOKE ALL ON FUNCTION product_category_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION product_category_counts() TO service_role;
