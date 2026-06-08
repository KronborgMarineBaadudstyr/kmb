-- 020_variant_barcodes.sql
-- Multi-barcode support per variant (production batch tracking)
-- Erstatter det enkelte ean-felt på product_variants med en separat tabel.

-- ── Tabel ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variant_barcodes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid        NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  ean         text        NOT NULL,
  is_primary  boolean     NOT NULL DEFAULT false,
  note        text,                 -- f.eks. "Batch 2024-01" eller "Gammel EAN"
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, ean)
);

CREATE INDEX IF NOT EXISTS variant_barcodes_variant_id_idx ON variant_barcodes (variant_id);
CREATE INDEX IF NOT EXISTS variant_barcodes_ean_idx        ON variant_barcodes (ean);

-- ── Migrér eksisterende ean-værdier ──────────────────────────────────────────
-- Kopier ean fra product_variants → variant_barcodes (primær stregkode)
INSERT INTO variant_barcodes (variant_id, ean, is_primary)
SELECT id, ean, true
FROM   product_variants
WHERE  ean IS NOT NULL AND ean <> ''
ON CONFLICT (variant_id, ean) DO NOTHING;

-- ── Constraint: kun ét primært stregkode pr. variant ─────────────────────────
-- Håndhæves via trigger (partial unique index på is_primary = true)
CREATE UNIQUE INDEX IF NOT EXISTS variant_barcodes_one_primary_idx
  ON variant_barcodes (variant_id)
  WHERE is_primary = true;

-- ── Trigger: sikr at is_primary er konsistent ved insert/update ───────────────
CREATE OR REPLACE FUNCTION trg_variant_barcodes_primary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Hvis ny/opdateret række sættes som primær, nulstil andre på samme variant
  IF NEW.is_primary THEN
    UPDATE variant_barcodes
    SET    is_primary = false
    WHERE  variant_id = NEW.variant_id
      AND  id <> NEW.id
      AND  is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variant_barcodes_primary ON variant_barcodes;
CREATE TRIGGER variant_barcodes_primary
BEFORE INSERT OR UPDATE ON variant_barcodes
FOR EACH ROW EXECUTE FUNCTION trg_variant_barcodes_primary();

-- Bemærk: product_variants.ean beholdes midlertidigt for bagudkompatibilitet.
-- Det kan fjernes i en fremtidig migration når alle klienter bruger variant_barcodes.
