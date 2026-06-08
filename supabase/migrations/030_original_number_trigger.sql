-- 030_original_number_trigger.sql
--
-- Automatisk håndtering af original_number på products-tabellen.
--
-- Prioritetsrækkefølge (bedst-kendte kilde vinder):
--   1. manufacturer_sku  — producentens eget varenummer (på kassen/varen)
--   2. ean               — international stregkode
--   3. internal_sku      — altid tilgængeligt (fallback)
--
-- Trigger-regler:
--   INSERT : altid auto-sæt (original_number er null på nye rækker)
--   UPDATE : re-evaluér KUN hvis original_number_source er en af de
--             auto-styrede kilder (manufacturer_sku / ean / internal_sku / null).
--             Hvis brugeren har sat en eksplicit kilde via admin-UI
--             (f.eks. supplier_sku:<id>, variant_ean:<id>, mfr_sku:<id>)
--             røres feltet IKKE.
--
-- Det betyder:
--   • Ny leverandør-import tilføjer manufacturer_sku → original_number
--     opgraderes automatisk fra 'ean' eller 'internal_sku'
--   • Brugerens manuelle valg (eksotiske kilder) bevares på tværs af imports
--   • Ingen kode-ændring nødvendig i importers — triggeren klarer det

-- ── Trigger-funktion ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_auto_original_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Håndter: eksplicit kilde-sletning (original_number sat til '' / null fra UI)
  IF NEW.original_number = '' THEN
    NEW.original_number := NULL;
  END IF;

  -- Bestem om vi må auto-styre dette felt
  -- Auto-styret = source er null ELLER er en af de tre standard-kilder
  IF NEW.original_number_source IS NOT DISTINCT FROM NULL
     OR NEW.original_number_source IN ('manufacturer_sku', 'ean', 'internal_sku')
  THEN
    -- Prioritet 1: manufacturer_sku
    IF NEW.manufacturer_sku IS NOT NULL AND NEW.manufacturer_sku <> '' THEN
      NEW.original_number        := NEW.manufacturer_sku;
      NEW.original_number_source := 'manufacturer_sku';

    -- Prioritet 2: EAN
    ELSIF NEW.ean IS NOT NULL AND NEW.ean <> '' THEN
      NEW.original_number        := NEW.ean;
      NEW.original_number_source := 'ean';

    -- Prioritet 3: internt SKU (altid tilgængeligt)
    ELSE
      NEW.original_number        := NEW.internal_sku;
      NEW.original_number_source := 'internal_sku';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Trigger på products ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_auto_original_number ON products;

CREATE TRIGGER trg_auto_original_number
  BEFORE INSERT OR UPDATE OF manufacturer_sku, ean, internal_sku, original_number, original_number_source
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_auto_original_number();

-- ── Backfill: sæt original_number for alle eksisterende produkter ─────────────
-- Kør prioritets-logikken for alle rækker der endnu ikke har original_number
-- ELLER har en auto-styret kilde (sikrer opgradering fra ean → manufacturer_sku
-- hvis manufacturer_sku siden hen er tilgået).

UPDATE products
SET
  original_number = CASE
    WHEN manufacturer_sku IS NOT NULL AND manufacturer_sku <> ''
      THEN manufacturer_sku
    WHEN ean IS NOT NULL AND ean <> ''
      THEN ean
    ELSE internal_sku
  END,
  original_number_source = CASE
    WHEN manufacturer_sku IS NOT NULL AND manufacturer_sku <> ''
      THEN 'manufacturer_sku'
    WHEN ean IS NOT NULL AND ean <> ''
      THEN 'ean'
    ELSE 'internal_sku'
  END
WHERE
  original_number IS NULL
  OR original_number_source IN ('manufacturer_sku', 'ean', 'internal_sku');
