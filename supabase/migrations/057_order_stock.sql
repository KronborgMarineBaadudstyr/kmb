-- Migration 057: Ordrer reserverer og trækker fra eget lager
--
-- Ordre afgives      → 'reserve': reservér min(antal, ledigt) pr. linje (resten skaffes hos leverandør)
-- Afhentet / afsluttet → 'deduct':  træk det reserverede fra beholdningen
-- Annulleret         → 'release': frigiv reservationen
-- Hver linje husker sit reserverede antal i line_items[].reserved_qty, så frigivelse/træk er præcist.
-- orders.stock_state gør handlingerne idempotente: none → reserved → deducted | released (→ reserved igen).
-- Alt logges i stock_adjustments, som også bruges af manuelle lagerjusteringer.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_state text NOT NULL DEFAULT 'none'
  CHECK (stock_state IN ('none', 'reserved', 'deducted', 'released'));

CREATE OR REPLACE FUNCTION order_stock_apply(p_order uuid, p_action text, p_actor text DEFAULT 'webshop')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  o      record;
  li     jsonb;
  lines  jsonb := '[]'::jsonb;
  v_new  text;
  v_ref  text;
  v_pid  uuid;
  v_vid  uuid;
  v_qty  int;
  v_res  int;
  v_avail int;
BEGIN
  SELECT id, order_number, line_items, stock_state INTO o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF    p_action = 'reserve' AND o.stock_state IN ('none', 'released') THEN v_new := 'reserved';
  ELSIF p_action = 'release' AND o.stock_state = 'reserved'           THEN v_new := 'released';
  ELSIF p_action = 'deduct'  AND o.stock_state = 'reserved'           THEN v_new := 'deducted';
  ELSE RETURN o.stock_state;   -- intet at gøre (fx klikket to gange)
  END IF;

  v_ref := 'Ordre ' || coalesce(o.order_number, o.id::text);

  FOR li IN SELECT value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(o.line_items) = 'array' THEN o.line_items ELSE '[]'::jsonb END
  ) LOOP
    v_pid := CASE WHEN li->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (li->>'product_id')::uuid END;
    v_vid := CASE WHEN li->>'variant_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (li->>'variant_id')::uuid END;
    v_qty := CASE WHEN li->>'qty' ~ '^\d+$' THEN (li->>'qty')::int ELSE 0 END;
    v_res := CASE WHEN li->>'reserved_qty' ~ '^\d+$' THEN (li->>'reserved_qty')::int ELSE 0 END;

    IF v_pid IS NOT NULL AND p_action = 'reserve' THEN
      IF v_vid IS NOT NULL THEN
        SELECT greatest(own_stock_quantity - own_stock_reserved, 0) INTO v_avail
          FROM product_variants WHERE id = v_vid FOR UPDATE;
      ELSE
        SELECT greatest(own_stock_quantity - own_stock_reserved, 0) INTO v_avail
          FROM products WHERE id = v_pid FOR UPDATE;
      END IF;
      v_res := least(v_qty, coalesce(v_avail, 0));
      IF v_res > 0 THEN
        IF v_vid IS NOT NULL THEN
          UPDATE product_variants SET own_stock_reserved = own_stock_reserved + v_res WHERE id = v_vid;
        ELSE
          UPDATE products SET own_stock_reserved = own_stock_reserved + v_res, updated_at = now() WHERE id = v_pid;
        END IF;
        INSERT INTO stock_adjustments (product_id, variant_id, field, delta, reason, note, created_by)
          VALUES (v_pid, v_vid, 'own_stock_reserved', v_res, 'reservation', v_ref, p_actor);
      END IF;
      li := li || jsonb_build_object('reserved_qty', v_res);

    ELSIF v_pid IS NOT NULL AND v_res > 0 THEN
      IF v_vid IS NOT NULL THEN
        UPDATE product_variants SET
          own_stock_reserved = greatest(own_stock_reserved - v_res, 0),
          own_stock_quantity = CASE WHEN p_action = 'deduct' THEN greatest(own_stock_quantity - v_res, 0) ELSE own_stock_quantity END
        WHERE id = v_vid;
      ELSE
        UPDATE products SET
          own_stock_reserved = greatest(own_stock_reserved - v_res, 0),
          own_stock_quantity = CASE WHEN p_action = 'deduct' THEN greatest(own_stock_quantity - v_res, 0) ELSE own_stock_quantity END,
          updated_at = now()
        WHERE id = v_pid;
      END IF;
      INSERT INTO stock_adjustments (product_id, variant_id, field, delta, reason, note, created_by)
        VALUES (v_pid, v_vid, 'own_stock_reserved', -v_res, 'reservation_release', v_ref, p_actor);
      IF p_action = 'deduct' THEN
        INSERT INTO stock_adjustments (product_id, variant_id, field, delta, reason, note, created_by)
          VALUES (v_pid, v_vid, 'own_stock_quantity', -v_res, 'sold', v_ref, p_actor);
      ELSE
        li := li || jsonb_build_object('reserved_qty', 0);
      END IF;
    END IF;

    lines := lines || jsonb_build_array(li);
  END LOOP;

  UPDATE orders SET line_items = lines, stock_state = v_new, updated_at = now() WHERE id = p_order;
  RETURN v_new;
END $$;

REVOKE EXECUTE ON FUNCTION order_stock_apply(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION order_stock_apply(uuid, text, text) TO service_role;
