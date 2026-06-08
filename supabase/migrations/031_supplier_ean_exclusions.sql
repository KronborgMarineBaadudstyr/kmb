-- ============================================================
-- Migration 031: Supplier EAN exclusions
-- ============================================================
-- Gemmer kendte fejl-EAN-data fra leverandører.
-- Overlever database-reset (rækker i denne tabel slettes IKKE af reset_products.sql).
-- Bruges af batchEanLookup() og create_ean_match_groups() RPC til at
-- undgå at matche leverandørprodukter med EAN der er dokumenteret forkert.
--
-- Eksempel: Leverandør B angiver EAN 1234 på "Fender", men EAN 1234 tilhører
-- "Ankerlys" fra Leverandør A. Admin afviser EAN-gruppen og markerer
-- Leverandør B som kilde til det forkerte EAN. Fremtidige imports fra
-- Leverandør B vil ignorere EAN 1234 som match-nøgle.
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_ean_exclusions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  ean          text NOT NULL,
  reason       text,                       -- fri tekst fra admin
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, ean)
);

CREATE INDEX IF NOT EXISTS idx_supplier_ean_exclusions_supplier ON supplier_ean_exclusions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ean_exclusions_ean      ON supplier_ean_exclusions(ean);

-- Opdater create_ean_match_groups() til at respektere ekskluderinger:
-- En EAN-gruppe oprettes kun hvis INGEN af staging-rækkerne med denne EAN
-- er i exclusions-tabellen for deres respektive leverandør.
-- Hvis én leverandørs EAN er ekskluderet, sættes de resterende rækker i single-grupper.
CREATE OR REPLACE FUNCTION create_ean_match_groups()
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  SET LOCAL statement_timeout = '0';

  WITH

  -- Alle ungrouped staging-rækker med EAN, ekskl. kendte fejl-EAN
  eligible AS (
    SELECT sps.id, sps.normalized_ean, sps.supplier_id, sps.normalized_name
    FROM supplier_product_staging sps
    WHERE sps.normalized_ean IS NOT NULL
      AND sps.normalized_ean <> ''
      AND sps.match_group_id IS NULL
      AND sps.status NOT IN ('rejected', 'matched', 'new_product')
      -- Ekskluder rækker hvor leverandøren har dokumenteret forkert EAN
      AND NOT EXISTS (
        SELECT 1 FROM supplier_ean_exclusions see
        WHERE see.supplier_id = sps.supplier_id
          AND see.ean = sps.normalized_ean
      )
  ),

  ean_summary AS (
    SELECT
      normalized_ean,
      COUNT(DISTINCT supplier_id)::int                                        AS sup_count,
      (array_agg(normalized_name ORDER BY length(normalized_name) DESC))[1]  AS best_name
    FROM eligible
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
      AND NOT EXISTS (
        SELECT 1 FROM supplier_ean_exclusions see
        WHERE see.supplier_id = sps.supplier_id
          AND see.ean = sps.normalized_ean
      )
    RETURNING sps.id
  )

  SELECT jsonb_build_object(
    'groups_created', (SELECT COUNT(*) FROM new_groups),
    'rows_assigned',  (SELECT COUNT(*) FROM updated)
  ) INTO result;

  RETURN result;
END;
$$;
