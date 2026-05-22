-- 019_import_change_log.sql
-- Automatisk sporing af prisændringer, nye produkter og udgåede produkter
-- Triggers kører på DB-niveau — ingen importer-kodeændringer nødvendige.

-- ── Tabel ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_change_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           uuid        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  change_type           text        NOT NULL
                        CHECK (change_type IN ('price_changed', 'new_product', 'discontinued')),
  supplier_sku          text        NOT NULL,
  product_name          text,

  -- Prisændring-detaljer (udfyldt kun for price_changed)
  old_purchase_price    numeric,
  new_purchase_price    numeric,
  old_recommended_price numeric,
  new_recommended_price numeric,

  -- Sammenkædning
  product_id            uuid REFERENCES products(id) ON DELETE SET NULL,
  staging_id            uuid,        -- supplier_product_staging.id

  -- Ekstra kontekst
  notes                 text,        -- bruges til 'discontinued': årsag / kilde
  seen_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_change_log_supplier_id_idx   ON import_change_log (supplier_id);
CREATE INDEX IF NOT EXISTS import_change_log_change_type_idx   ON import_change_log (change_type);
CREATE INDEX IF NOT EXISTS import_change_log_seen_at_idx       ON import_change_log (seen_at DESC);
CREATE INDEX IF NOT EXISTS import_change_log_product_id_idx    ON import_change_log (product_id);

-- ── Trigger: prisændring på product_suppliers ─────────────────────────────────
CREATE OR REPLACE FUNCTION trg_log_supplier_price_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    OLD.purchase_price            IS DISTINCT FROM NEW.purchase_price OR
    OLD.recommended_sales_price   IS DISTINCT FROM NEW.recommended_sales_price
  ) THEN
    INSERT INTO import_change_log (
      supplier_id, change_type, supplier_sku, product_name,
      old_purchase_price, new_purchase_price,
      old_recommended_price, new_recommended_price,
      product_id
    ) VALUES (
      NEW.supplier_id, 'price_changed', NEW.supplier_sku, NEW.supplier_product_name,
      OLD.purchase_price,          NEW.purchase_price,
      OLD.recommended_sales_price, NEW.recommended_sales_price,
      NEW.product_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_suppliers_price_change ON product_suppliers;
CREATE TRIGGER product_suppliers_price_change
AFTER UPDATE ON product_suppliers
FOR EACH ROW EXECUTE FUNCTION trg_log_supplier_price_change();

-- ── Trigger: nyt produkt i staging ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_log_new_staging_product()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO import_change_log (
    supplier_id, change_type, supplier_sku, product_name, staging_id
  ) VALUES (
    NEW.supplier_id, 'new_product', NEW.normalized_sku, NEW.normalized_name, NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staging_new_product ON supplier_product_staging;
CREATE TRIGGER staging_new_product
AFTER INSERT ON supplier_product_staging
FOR EACH ROW EXECUTE FUNCTION trg_log_new_staging_product();

-- ── Trigger: nyt product_supplier (produkt fra leverandør matchet direkte) ────
CREATE OR REPLACE FUNCTION trg_log_new_product_supplier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Kun log INSERT hvis det er et genuint nyt leverandørprodukt
  -- (undgå at logge ved migration/bulk-indsættelse: kig om product_id er sat)
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO import_change_log (
      supplier_id, change_type, supplier_sku, product_name,
      new_purchase_price, new_recommended_price, product_id
    ) VALUES (
      NEW.supplier_id, 'new_product', NEW.supplier_sku, NEW.supplier_product_name,
      NEW.purchase_price, NEW.recommended_sales_price, NEW.product_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Bemærk: denne trigger er IKKE aktiveret som standard for at undgå støj ved
-- initial data-indlæsning. Aktiver manuelt hvis ønsket:
-- CREATE TRIGGER product_suppliers_new_product
-- AFTER INSERT ON product_suppliers
-- FOR EACH ROW EXECUTE FUNCTION trg_log_new_product_supplier();
