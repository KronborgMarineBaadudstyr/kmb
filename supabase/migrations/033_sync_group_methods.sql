-- Migration 033: sync_group_methods()
-- Recalculates match_method for all groups based on actual distinct supplier count
-- among assigned staging rows.
--
--   single-supplier group with match_method='ean'  → downgrade to 'single'
--   multi-supplier  group with match_method='single' → upgrade   to 'ean'
--
-- Called at the end of runEanPhase() after assign_ean_groups(), so it catches both
-- historical mis-classifications and the future "second supplier arrives" scenario.

CREATE OR REPLACE FUNCTION sync_group_methods()
RETURNS jsonb
LANGUAGE sql AS $$
  WITH supplier_counts AS (
    SELECT
      match_group_id,
      COUNT(DISTINCT supplier_id) AS sup_count
    FROM supplier_product_staging
    WHERE match_group_id IS NOT NULL
      AND status NOT IN ('rejected', 'matched', 'new_product')
    GROUP BY match_group_id
  ),
  upgrades AS (
    UPDATE staging_match_groups smg
    SET
      match_method      = 'ean',
      match_confidence  = 'high',
      supplier_count    = sc.sup_count
    FROM supplier_counts sc
    WHERE smg.id            = sc.match_group_id
      AND smg.match_method  = 'single'
      AND sc.sup_count      >= 2
    RETURNING smg.id
  ),
  downgrades AS (
    UPDATE staging_match_groups smg
    SET
      match_method     = 'single',
      match_confidence = 'high',
      supplier_count   = sc.sup_count
    FROM supplier_counts sc
    WHERE smg.id            = sc.match_group_id
      AND smg.match_method  = 'ean'
      AND sc.sup_count      < 2
    RETURNING smg.id
  )
  SELECT jsonb_build_object(
    'upgraded',   (SELECT COUNT(*) FROM upgrades),
    'downgraded', (SELECT COUNT(*) FROM downgrades)
  );
$$;
