-- ============================================================
-- RESET: Slet alle oprettede produkter og nulstil staging
-- Bevar: suppliers, supplier_product_staging, known_brands, boat_hotspots
--
-- ADVARSEL: Denne migration er DESTRUKTIV og IRREVERSIBEL.
-- Kør KUN dette hvis du bevidst vil starte produktkatalog forfra.
-- Alle manuelle berigelser (beskrivelser, priser, billeder) slettes.
--
-- Kør i Supabase SQL Editor — BEKRÆFT INDEN KØRSEL.
-- ============================================================

-- 1. Slet afledte produkt-data (FK-afhængige tabeller først)
DELETE FROM variant_barcodes;
DELETE FROM product_variants;
DELETE FROM product_images;
DELETE FROM product_files;
DELETE FROM product_suppliers;
DELETE FROM campaign_products;
DELETE FROM campaigns;

-- 2. Slet selve produkterne
DELETE FROM products;

-- 3. Nulstil staging — sæt alt tilbage til pending_review
--    (beholder raw_data og normalized_* felter — kun status nulstilles)
UPDATE supplier_product_staging
SET
  status          = 'pending_review',
  match_suggestions = '[]'::jsonb,
  updated_at      = now()
WHERE status IN ('matched', 'rejected', 'needs_review');

-- 4. Ryd matching-grupper (bliver genskabt ved næste "Kør matching")
DELETE FROM staging_match_groups;

-- 5. Nulstil import_change_log (valgfri — kommenter ud for at beholde historik)
-- DELETE FROM import_change_log;

-- Bekræft antal
SELECT
  (SELECT count(*) FROM products)                                     AS products,
  (SELECT count(*) FROM product_variants)                             AS variants,
  (SELECT count(*) FROM product_images)                               AS images,
  (SELECT count(*) FROM product_suppliers)                            AS supplier_links,
  (SELECT count(*) FROM supplier_product_staging)                     AS staging_total,
  (SELECT count(*) FROM supplier_product_staging
   WHERE status = 'pending_review')                                   AS staging_pending,
  (SELECT count(*) FROM suppliers)                                    AS suppliers_kept;
