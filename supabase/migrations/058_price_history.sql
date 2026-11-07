-- Migration 058: Prishistorik
-- Logger automatisk hver ændring af salgs- og tilbudspris på produkter og varianter (via trigger,
-- så ændringer fra alle steder fanges: produktside, prissætning, masseopdatering, import).
-- Bruges af salgsanalysen og AI-assistenten til at måle, hvordan prisændringer påvirker salget.

CREATE TABLE IF NOT EXISTS price_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  field       text NOT NULL CHECK (field IN ('sales_price', 'sale_price')),
  old_value   numeric(10,2),
  new_value   numeric(10,2),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, changed_at);

CREATE OR REPLACE FUNCTION log_product_price_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sales_price IS DISTINCT FROM OLD.sales_price THEN
    INSERT INTO price_history (product_id, field, old_value, new_value) VALUES (NEW.id, 'sales_price', OLD.sales_price, NEW.sales_price);
  END IF;
  IF NEW.sale_price IS DISTINCT FROM OLD.sale_price THEN
    INSERT INTO price_history (product_id, field, old_value, new_value) VALUES (NEW.id, 'sale_price', OLD.sale_price, NEW.sale_price);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION log_variant_price_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sales_price IS DISTINCT FROM OLD.sales_price THEN
    INSERT INTO price_history (product_id, variant_id, field, old_value, new_value) VALUES (NEW.product_id, NEW.id, 'sales_price', OLD.sales_price, NEW.sales_price);
  END IF;
  IF NEW.sale_price IS DISTINCT FROM OLD.sale_price THEN
    INSERT INTO price_history (product_id, variant_id, field, old_value, new_value) VALUES (NEW.product_id, NEW.id, 'sale_price', OLD.sale_price, NEW.sale_price);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_price_history ON products;
CREATE TRIGGER trg_product_price_history
  AFTER UPDATE OF sales_price, sale_price ON products
  FOR EACH ROW EXECUTE FUNCTION log_product_price_change();

DROP TRIGGER IF EXISTS trg_variant_price_history ON product_variants;
CREATE TRIGGER trg_variant_price_history
  AFTER UPDATE OF sales_price, sale_price ON product_variants
  FOR EACH ROW EXECUTE FUNCTION log_variant_price_change();

-- Udgangspunkt: nuværende priser, så "prisen før første ændring" er kendt
INSERT INTO price_history (product_id, field, old_value, new_value)
  SELECT id, 'sales_price', NULL, sales_price FROM products WHERE sales_price IS NOT NULL;
INSERT INTO price_history (product_id, variant_id, field, old_value, new_value)
  SELECT product_id, id, 'sales_price', NULL, sales_price FROM product_variants
  WHERE sales_price IS NOT NULL AND product_id IS NOT NULL;

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON price_history FROM anon, authenticated;
GRANT ALL ON price_history TO service_role;
