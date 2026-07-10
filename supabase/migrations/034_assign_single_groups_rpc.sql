-- Migration 034: assign_single_groups()
-- Bulk-assigns staging rows to their single-supplier group by matching on
-- the staging row id stored temporarily in staging_match_groups.notes.
-- Called after each batch of single-group inserts to avoid 30k individual updates.

CREATE OR REPLACE FUNCTION assign_single_groups()
RETURNS int LANGUAGE sql AS $$
  WITH updated AS (
    UPDATE supplier_product_staging sps
    SET match_group_id = smg.id
    FROM staging_match_groups smg
    WHERE smg.notes    = sps.id::text
      AND smg.match_method = 'single'
      AND sps.match_group_id IS NULL
    RETURNING sps.id
  )
  SELECT COUNT(*)::int FROM updated;
$$;
