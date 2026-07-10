-- Migration 037: auto_match_staging_to_products()
-- Bulk fuzzy-matches pending staging rows against existing products.
-- Returns the best product match per staging row where similarity >= threshold.
-- Processed in batches (batch_limit / batch_offset) to stay within statement timeout.

CREATE OR REPLACE FUNCTION auto_match_staging_to_products(
  threshold    float   DEFAULT 0.85,
  batch_limit  int     DEFAULT 500,
  batch_offset int     DEFAULT 0
)
RETURNS TABLE(
  staging_id   uuid,
  product_id   uuid,
  score        float,
  product_name text,
  staging_name text,
  supplier_id  uuid
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (sps.id)
    sps.id             AS staging_id,
    p.id               AS product_id,
    similarity(
      normalize_for_matching(sps.normalized_name),
      normalize_for_matching(p.name)
    )                  AS score,
    p.name             AS product_name,
    sps.normalized_name AS staging_name,
    sps.supplier_id    AS supplier_id
  FROM (
    SELECT id, normalized_name, supplier_id
    FROM   supplier_product_staging
    WHERE  status         = 'pending_review'
      AND  match_group_id IS NULL
    ORDER  BY id
    LIMIT  batch_limit
    OFFSET batch_offset
  ) sps
  JOIN products p
    ON  p.status NOT IN ('archived', 'rejected')
    AND similarity(
          normalize_for_matching(sps.normalized_name),
          normalize_for_matching(p.name)
        ) >= threshold
  ORDER BY sps.id, score DESC;
$$;
