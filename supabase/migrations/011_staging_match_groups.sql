-- ============================================================
-- Kronborg Marine — Migration 011: Staging Match Groups
-- Cross-supplier product matching system
-- ============================================================

-- normalize_for_matching: strips colors, directions and size adjectives
-- before fuzzy comparison to improve cross-supplier matching
CREATE OR REPLACE FUNCTION normalize_for_matching(t text) RETURNS text AS $$
  SELECT trim(regexp_replace(
    regexp_replace(lower(t),
      '\m(rød|blå|grøn|sort|hvid|gul|grå|brun|orange|lilla|pink|
           red|blue|green|black|white|yellow|grey|gray|brown|purple|
           venstre|højre|left|right|øverste|nederste|top|bottom|
           lille|stor|mellem|mini|maxi|ekstra|super|ny|new)\M',
      '', 'gi'),
    '\s+', ' ', 'g'))
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- STAGING MATCH GROUPS
-- Groups supplier staging rows that likely represent the same product
-- ============================================================
CREATE TABLE staging_match_groups (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status            text NOT NULL DEFAULT 'pending_review',
    -- pending_review / confirmed / rejected / product_created
  match_confidence  text NOT NULL DEFAULT 'low',
    -- high (ean) / medium (fuzzy>=0.65) / low (fuzzy 0.45-0.64)
  match_method      text NOT NULL DEFAULT 'fuzzy_name',
    -- ean / fuzzy_name / manual / single
  supplier_count    int NOT NULL DEFAULT 1,
  suggested_name    text,   -- admin picks from group members
  suggested_ean     text,
  product_id        uuid REFERENCES products(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_groups_status_check
    CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'product_created')),
  CONSTRAINT match_groups_confidence_check
    CHECK (match_confidence IN ('high', 'medium', 'low')),
  CONSTRAINT match_groups_method_check
    CHECK (match_method IN ('ean', 'fuzzy_name', 'manual', 'single'))
);

CREATE INDEX idx_match_groups_status     ON staging_match_groups(status);
CREATE INDEX idx_match_groups_confidence ON staging_match_groups(match_confidence);
CREATE INDEX idx_match_groups_product_id ON staging_match_groups(product_id);

-- Add match_group_id to staging table
ALTER TABLE supplier_product_staging
  ADD COLUMN IF NOT EXISTS match_group_id uuid REFERENCES staging_match_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staging_match_group ON supplier_product_staging(match_group_id);

-- updated_at trigger (reuses existing update_updated_at function from migration 001)
CREATE TRIGGER match_groups_updated_at
  BEFORE UPDATE ON staging_match_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RPC: find_fuzzy_staging_matches
-- Finds pairs of unmatched staging rows from different suppliers
-- with high word_similarity on their normalized names.
-- Uses first-3-words bucketing to avoid O(n^2) full cross-join.
-- ============================================================
CREATE OR REPLACE FUNCTION find_fuzzy_staging_matches(min_score float DEFAULT 0.65)
RETURNS TABLE(id_a uuid, id_b uuid, score float)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT
      id,
      supplier_id,
      -- Extract first 3 words as bucket key for candidate reduction
      array_to_string(
        (string_to_array(normalize_for_matching(normalized_name), ' '))[1:3],
        ' '
      ) AS bucket,
      normalize_for_matching(normalized_name) AS norm_name
    FROM supplier_product_staging
    WHERE match_group_id IS NULL
      AND status NOT IN ('rejected', 'matched', 'new_product')
      AND normalized_name IS NOT NULL
      AND length(normalized_name) > 3
  )
  SELECT DISTINCT ON (LEAST(a.id, b.id), GREATEST(a.id, b.id))
    LEAST(a.id, b.id)    AS id_a,
    GREATEST(a.id, b.id) AS id_b,
    word_similarity(a.norm_name, b.norm_name)::float AS score
  FROM candidates a
  JOIN candidates b
    ON a.bucket = b.bucket
   AND a.supplier_id != b.supplier_id
   AND a.id < b.id
  WHERE word_similarity(a.norm_name, b.norm_name) >= min_score
  ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id), score DESC;
$$;
