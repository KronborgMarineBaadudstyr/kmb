-- Migration 066: Leverandørens prisændringer slår igennem på vores produkt
-- Når en import ændrer leverandørens vejledende pris på en vare, vi har oprettet:
--   * Følger vores salgspris leverandørens gamle vejl. pris (ikke ændret af os), og er leverandøren den
--     foretrukne (laveste prioritet blandt aktive), sættes vores salgspris til den nye vejl. pris.
--   * Har vi selv sat en anden pris, røres den ikke — ændringen vises på Import-ændringer, hvor admin
--     kan vælge at bruge den nye pris.
-- Indkøbsprisen ligger allerede på product_suppliers og opdateres direkte af importen.
-- Ændringen af vores salgspris logges også i price_history (trigger fra migration 058).
--
-- price_action på import_change_log:
--   followed    — vores pris fulgte med (our_price_old → our_price_new)
--   own_price   — vi har vores egen pris; den er ikke ændret
--   not_primary — en anden leverandør har højere prioritet på varen
--   no_price    — varen har endnu ingen salgspris (sættes på Prissætning)
--   inherits    — varianten har ingen egen pris (bruger produktets)
--   applied     — admin har bagefter valgt at bruge den nye vejl. pris
--   NULL        — kun indkøbsprisen er ændret

ALTER TABLE import_change_log
  ADD COLUMN IF NOT EXISTS variant_id    uuid,
  ADD COLUMN IF NOT EXISTS our_price_old numeric(10,2),
  ADD COLUMN IF NOT EXISTS our_price_new numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_action  text
    CHECK (price_action IN ('followed', 'own_price', 'not_primary', 'no_price', 'inherits', 'applied'));

CREATE OR REPLACE FUNCTION trg_log_supplier_price_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_old     numeric(10,2);
  v_new     numeric(10,2);
  v_action  text;
  v_primary boolean;
BEGIN
  IF OLD.purchase_price          IS NOT DISTINCT FROM NEW.purchase_price
 AND OLD.recommended_sales_price IS NOT DISTINCT FROM NEW.recommended_sales_price THEN
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    IF NEW.variant_id IS NOT NULL THEN
      SELECT sales_price INTO v_old FROM product_variants WHERE id = NEW.variant_id;
    ELSE
      SELECT sales_price INTO v_old FROM products WHERE id = NEW.product_id;
    END IF;
    v_new := v_old;

    IF OLD.recommended_sales_price IS DISTINCT FROM NEW.recommended_sales_price THEN
      v_primary := NEW.is_active AND NOT EXISTS (
        SELECT 1 FROM product_suppliers ps
        WHERE ps.product_id = NEW.product_id
          AND ps.variant_id IS NOT DISTINCT FROM NEW.variant_id
          AND ps.is_active
          AND ps.id <> NEW.id
          AND ps.priority < NEW.priority
      );

      IF v_old IS NULL THEN
        v_action := CASE WHEN NEW.variant_id IS NOT NULL THEN 'inherits' ELSE 'no_price' END;
      ELSIF NOT v_primary THEN
        v_action := 'not_primary';
      ELSIF v_old = OLD.recommended_sales_price AND coalesce(NEW.recommended_sales_price, 0) > 0 THEN
        v_new    := NEW.recommended_sales_price;
        v_action := 'followed';
        IF NEW.variant_id IS NOT NULL THEN
          UPDATE product_variants SET sales_price = v_new WHERE id = NEW.variant_id;
        ELSE
          UPDATE products SET sales_price = v_new WHERE id = NEW.product_id;
        END IF;
      ELSE
        v_action := 'own_price';
      END IF;
    END IF;
  END IF;

  INSERT INTO import_change_log (
    supplier_id, change_type, supplier_sku, product_name,
    old_purchase_price, new_purchase_price,
    old_recommended_price, new_recommended_price,
    product_id, variant_id, our_price_old, our_price_new, price_action
  ) VALUES (
    NEW.supplier_id, 'price_changed', NEW.supplier_sku, NEW.supplier_product_name,
    OLD.purchase_price,          NEW.purchase_price,
    OLD.recommended_sales_price, NEW.recommended_sales_price,
    NEW.product_id, NEW.variant_id, v_old, v_new, v_action
  );
  RETURN NEW;
END;
$$;

-- Triggeren fra migration 019 bruger allerede funktionen (AFTER UPDATE ON product_suppliers)
DROP TRIGGER IF EXISTS product_suppliers_price_change ON product_suppliers;
CREATE TRIGGER product_suppliers_price_change
AFTER UPDATE ON product_suppliers
FOR EACH ROW EXECUTE FUNCTION trg_log_supplier_price_change();
