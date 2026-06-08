-- 029_get_all_categories_rpc.sql
-- Hjælpe-RPC der returnerer alle kendte kategori-navne på tværs af products + staging.
-- Bruges af category-filters admin-siden til at populere dropdown.

CREATE OR REPLACE FUNCTION get_all_categories()
RETURNS TABLE(category text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT c
  FROM (
    -- Fra færdige produkter
    SELECT unnest(p.categories) AS c FROM products p WHERE p.categories IS NOT NULL
    UNION ALL
    -- Fra staging rådata (Palby, Engholm m.fl. sender kategorier her)
    SELECT unnest(
      CASE
        WHEN jsonb_typeof(s.raw_data->'categories') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(s.raw_data->'categories'))
        ELSE ARRAY[]::text[]
      END
    ) AS c
    FROM supplier_product_staging s
    WHERE s.raw_data->'categories' IS NOT NULL
  ) sub
  WHERE c IS NOT NULL AND c <> ''
  ORDER BY c;
$$;
