-- Migration 062: Bedre fuzzy-matching
--
-- 1. normalize_for_matching() v2. Den gamle version fra 011 havde linjeskift inde i ordlisten,
--    så "red", "venstre" og "lille" blev aldrig fjernet. Nu også:
--    - flere farver (inkl. bøjninger: røde/rødt, mørkeblå …), bagbord/styrbord, størrelser (S–XXL)
--    - fyldord (og/med/til/for …), emballage (stk/pk/pakke/pcs) og "ny/original"
--    - tal skrives ens: "2,5" → "2.5", "10 mm" → "10mm", "10 x 20" → "10x20", "Ø10" → "10"
--    - tegnsætning fjernes (punktum i decimaltal bevares)
--    Samme regler findes i lib/matching-normalize.ts — ret begge steder.
--
-- 2. Talværn: to navne matches kun hvis tallene i det ene er en delmængde af tallene i det andet.
--    "Ankerkæde 10mm" vs "Ankerkæde 12mm" gav før 0,74 i lighed (over grænsen 0,65) og blev grupperet.
--    "Fender 15x58" vs "Lalizas 70123 Fender 15x58" er stadig et match ({15,58} ⊂ {15,58,70123}).

CREATE OR REPLACE FUNCTION normalize_for_matching(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(t, '')), '(\d),(\d)', '\1.\2', 'g'),   -- decimalkomma
            'ø\s*(?=\d)', ' ', 'g'),                                              -- Ø10 → 10
          '[^[:alnum:].]+|\.(?!\d)|(?<!\d)\.', ' ', 'g'),                         -- tegnsætning
        '(\d)\s*x\s*(?=\d)', '\1x', 'g'),                                         -- 10 x 20 → 10x20
      '(\d)\s+(mm|cm|m|km|kg|g|l|ml|ltr|liter|v|w|a|ah|bar|hk|hp|kn|tommer|inch|m2|m3)(?![[:alnum:]])', '\1\2', 'g'),
    '(?<![[:alnum:]])('
      -- farver
      || 'rød|røde|rødt|blå|blåt|blåe|grøn|grønne|grønt|sort|sorte|hvid|hvide|hvidt|gul|gule|gult|grå|brun|brune|brunt'
      || '|orange|lilla|pink|rosa|beige|creme|turkis|navy|bordeaux|sølv|guld'
      || '|marineblå|mørkeblå|lyseblå|mørkegrå|lysegrå|mørkegrøn|lysegrøn'
      || '|red|blue|green|black|white|yellow|grey|gray|brown|purple|turquoise|silver|gold'
      -- retning/side
      || '|venstre|højre|left|right|øverste|nederste|top|bottom|bagbord|styrbord|port|starboard'
      -- størrelsesord
      || '|lille|små|stor|store|mellem|medium|mini|maxi|ekstra|extra|super|small|large|xs|s|m|l|xl|xxl|xxxl'
      -- ny/original, emballage, fyldord
      || '|ny|nye|nyt|new|original|orig|stk|pk|pak|pakke|pcs|pc'
      || '|og|med|til|for|fra|af|i|på|den|det|en|et|and|with|the|of|to|inkl|incl|ca'
      || ')(?![[:alnum:]])', ' ', 'g'),
  '\s+', ' ', 'g'))
$$;

-- Tal i et (normaliseret) navn, sorteret og uden dubletter: "15x58cm 2.50" → {15,2.5,58}
CREATE OR REPLACE FUNCTION matching_numbers(norm text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(array_agg(DISTINCT n ORDER BY n), '{}')
  FROM (SELECT trim_scale(m[1]::numeric)::text AS n
        FROM regexp_matches(coalesce(norm, ''), '(\d+(?:\.\d+)?)', 'g') AS m) x
$$;

-- Tallene må ikke modsige hinanden: det ene sæt skal være indeholdt i det andet
CREATE OR REPLACE FUNCTION numbers_compatible(a text[], b text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT a <@ b OR b <@ a
$$;

-- Fuzzy-par på tværs af leverandører (fra 011) — nu med talværn
CREATE OR REPLACE FUNCTION find_fuzzy_staging_matches(min_score float DEFAULT 0.65)
RETURNS TABLE(id_a uuid, id_b uuid, score float)
LANGUAGE sql STABLE AS $$
  WITH candidates AS MATERIALIZED (
    SELECT id, supplier_id, norm_name,
           array_to_string((string_to_array(norm_name, ' '))[1:3], ' ') AS bucket,
           matching_numbers(norm_name) AS nums
    FROM (
      SELECT id, supplier_id, normalize_for_matching(normalized_name) AS norm_name
      FROM supplier_product_staging
      WHERE match_group_id IS NULL
        AND status NOT IN ('rejected', 'matched', 'new_product')
        AND normalized_name IS NOT NULL
        AND length(normalized_name) > 3
    ) s
    WHERE norm_name <> ''
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
    AND numbers_compatible(a.nums, b.nums)
  ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id), score DESC;
$$;

-- Staging → eksisterende produkter (fra 037) — normaliserer hvert produktnavn én gang, nu med talværn
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
  WITH sps AS MATERIALIZED (
    SELECT id, normalized_name, supplier_id, norm, matching_numbers(norm) AS nums
    FROM (
      SELECT id, normalized_name, supplier_id, normalize_for_matching(normalized_name) AS norm
      FROM   supplier_product_staging
      WHERE  status         = 'pending_review'
        AND  match_group_id IS NULL
      ORDER  BY id
      LIMIT  batch_limit
      OFFSET batch_offset
    ) s
  ),
  p AS MATERIALIZED (
    SELECT id, name, norm, matching_numbers(norm) AS nums
    FROM (SELECT id, name, normalize_for_matching(name) AS norm
          FROM products WHERE status NOT IN ('archived', 'rejected')) x
  )
  SELECT DISTINCT ON (sps.id)
    sps.id                         AS staging_id,
    p.id                           AS product_id,
    similarity(sps.norm, p.norm)   AS score,
    p.name                         AS product_name,
    sps.normalized_name            AS staging_name,
    sps.supplier_id                AS supplier_id
  FROM sps
  JOIN p
    ON  similarity(sps.norm, p.norm) >= threshold
    AND numbers_compatible(sps.nums, p.nums)
  ORDER BY sps.id, score DESC;
$$;
