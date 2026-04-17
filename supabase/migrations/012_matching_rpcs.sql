-- ============================================================
-- Migration 012: Bulk matching RPCs for performance
-- ============================================================

-- create_ean_match_groups():
-- Groups all ungrouped staging rows by normalized_ean in one SQL operation.
-- EANs shared by 2+ suppliers get method='ean', single-supplier EANs get method='single'.
-- Returns {groups_created, rows_assigned}.
CREATE OR REPLACE FUNCTION create_ean_match_groups()
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  SET LOCAL statement_timeout = '0';

  WITH ean_summary AS (
    SELECT
      normalized_ean,
      COUNT(DISTINCT supplier_id)::int                                        AS sup_count,
      (array_agg(normalized_name ORDER BY length(normalized_name) DESC))[1]  AS best_name
    FROM supplier_product_staging
    WHERE normalized_ean IS NOT NULL
      AND normalized_ean <> ''
      AND match_group_id IS NULL
      AND status NOT IN ('rejected', 'matched', 'new_product')
    GROUP BY normalized_ean
  ),
  new_groups AS (
    INSERT INTO staging_match_groups
      (match_confidence, match_method, supplier_count, suggested_name, suggested_ean, status)
    SELECT
      'high',
      CASE WHEN sup_count >= 2 THEN 'ean' ELSE 'single' END,
      sup_count,
      best_name,
      normalized_ean,
      'pending_review'
    FROM ean_summary
    RETURNING id, suggested_ean
  ),
  updated AS (
    UPDATE supplier_product_staging sps
    SET match_group_id = ng.id
    FROM new_groups ng
    WHERE ng.suggested_ean = sps.normalized_ean
      AND sps.match_group_id IS NULL
      AND sps.status NOT IN ('rejected', 'matched', 'new_product')
    RETURNING sps.id
  )
  SELECT jsonb_build_object(
    'groups_created', (SELECT COUNT(*) FROM new_groups),
    'rows_assigned',  (SELECT COUNT(*) FROM updated)
  ) INTO result;

  RETURN result;
END;
$$;


-- create_single_supplier_groups():
-- Creates one staging_match_groups row per remaining ungrouped staging row.
-- Uses notes column as temporary correlation key, clears it at the end.
-- Returns {groups_created, rows_assigned}.
CREATE OR REPLACE FUNCTION create_single_supplier_groups()
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  SET LOCAL statement_timeout = '0';

  WITH to_group AS (
    SELECT id, normalized_name, normalized_ean
    FROM supplier_product_staging
    WHERE match_group_id IS NULL
      AND status NOT IN ('rejected', 'matched', 'new_product')
  ),
  new_groups AS (
    INSERT INTO staging_match_groups
      (match_confidence, match_method, supplier_count, suggested_name, suggested_ean, status, notes)
    SELECT
      CASE WHEN normalized_ean IS NOT NULL AND normalized_ean <> '' THEN 'high' ELSE 'low' END,
      'single',
      1,
      normalized_name,
      NULLIF(normalized_ean, ''),
      'pending_review',
      id::text   -- temporary correlation key
    FROM to_group
    RETURNING id AS group_id, notes AS staging_id
  ),
  updated AS (
    UPDATE supplier_product_staging sps
    SET match_group_id = ng.group_id
    FROM new_groups ng
    WHERE sps.id::text = ng.staging_id
    RETURNING sps.id
  )
  SELECT jsonb_build_object(
    'groups_created', (SELECT COUNT(*) FROM new_groups),
    'rows_assigned',  (SELECT COUNT(*) FROM updated)
  ) INTO result;

  -- Clear the temporary correlation key from notes
  UPDATE staging_match_groups
  SET notes = NULL
  WHERE notes IS NOT NULL
    AND match_method = 'single';

  RETURN result;
END;
$$;
