-- Migration 032: assign_ean_groups()
-- Assigns match_group_id to staging rows by joining on normalized_ean.
-- Called after EAN groups have been bulk-inserted — replaces N individual UPDATEs
-- with a single SQL pass.
CREATE OR REPLACE FUNCTION assign_ean_groups()
RETURNS int
LANGUAGE sql AS $$
  WITH updated AS (
    UPDATE supplier_product_staging sps
    SET match_group_id = smg.id
    FROM staging_match_groups smg
    WHERE smg.suggested_ean  = sps.normalized_ean
      AND smg.suggested_ean IS NOT NULL
      AND sps.match_group_id IS NULL
      AND sps.status NOT IN ('rejected', 'matched', 'new_product')
    RETURNING sps.id
  )
  SELECT COUNT(*)::int FROM updated;
$$;
