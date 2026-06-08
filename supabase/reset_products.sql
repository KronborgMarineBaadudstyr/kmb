-- ============================================================
-- PRODUKT-NULSTILLING — KronborgMarine PIM
-- ============================================================
-- Sletter alle oprettede produkter og nulstiller staging/matching
-- så du kan starte forfra med importer.
--
-- BEVARER (røres ikke):
--   suppliers               — leverandørdata og FTP-credentials
--   supplier_product_staging — rådata fra leverandørfeeds (status nulstilles)
--   known_brands            — brand-liste
--   boat_hotspots           — båd-navigation
--   category_attribute_filters — kategori-søgefilter-konfiguration
--
-- SLETTER:
--   products + alle afledte tabeller (varianter, billeder, filer, kampagner)
--   product_suppliers        — leverandørtilknytninger
--   staging_match_groups     — match-grupper (genskabes ved næste matching-kørsel)
--   import_change_log        — import-historik (valgfrit — se kommentar nedenfor)
--
-- ADVARSEL: DESTRUKTIV OG IRREVERSIBEL.
-- Kør i Supabase SQL Editor — bekræft inden kørsel.
-- ============================================================

BEGIN;

-- ── 1. Afledte produkt-tabeller (FK-afhængige — skal slettes i rækkefølge) ────
-- Bruger DO-blok så tabeller der endnu ikke er migreret ikke stopper scriptet.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'variant_barcodes')   THEN DELETE FROM variant_barcodes;   END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_variants')   THEN DELETE FROM product_variants;   END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_images')     THEN DELETE FROM product_images;     END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_files')      THEN DELETE FROM product_files;      END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_suppliers')  THEN DELETE FROM product_suppliers;  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campaign_products')  THEN DELETE FROM campaign_products;  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campaigns')          THEN DELETE FROM campaigns;          END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'import_change_log')  THEN DELETE FROM import_change_log;  END IF;
END $$;

-- ── 2. Selve produkterne ──────────────────────────────────────────────────────

DELETE FROM products;

-- ── 3. Match-grupper ──────────────────────────────────────────────────────────

DELETE FROM staging_match_groups;

-- ── 4. Nulstil staging-rækker ─────────────────────────────────────────────────
-- Beholder raw_data, normalized_* og alle leverandørfelter intakt.
-- Nulstiller: status, match-tilstand, forslag.

UPDATE supplier_product_staging
SET
  status             = 'pending_review',
  match_group_id     = NULL,
  matched_product_id = NULL,
  match_suggestions  = '[]'::jsonb,
  updated_at         = now();

-- ── 6. Bekræft resultat ───────────────────────────────────────────────────────

SELECT
  'products'                AS tabel,
  count(*)::text            AS antal
FROM products
UNION ALL SELECT 'product_variants',   count(*)::text FROM product_variants
UNION ALL SELECT 'product_images',     count(*)::text FROM product_images
UNION ALL SELECT 'product_suppliers',  count(*)::text FROM product_suppliers
UNION ALL SELECT 'campaigns',          count(*)::text FROM campaigns
UNION ALL SELECT 'staging_match_groups', count(*)::text FROM staging_match_groups
UNION ALL SELECT '── staging total',   count(*)::text FROM supplier_product_staging
UNION ALL SELECT '── staging pending', count(*)::text FROM supplier_product_staging WHERE status = 'pending_review'
UNION ALL SELECT '── suppliers kept',  count(*)::text FROM suppliers
UNION ALL SELECT '── known_brands kept', count(*)::text FROM known_brands
UNION ALL SELECT '── cat.filters kept', count(*)::text FROM category_attribute_filters;

COMMIT;
