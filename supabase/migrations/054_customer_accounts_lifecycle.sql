-- Migration 054: Kundelogin (magic link) + forventet levetid + udskiftningspåmindelser
-- Kør efter 053.

-- ── Kunder: e-mail ELLER telefon (gamle ordrer importeres med én af dem) ──────────
ALTER TABLE shop_users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE shop_users
  ADD COLUMN IF NOT EXISTS phone             text UNIQUE,   -- normaliseret, fx +4512345678
  ADD COLUMN IF NOT EXISTS name              text,
  ADD COLUMN IF NOT EXISTS last_login_at     timestamptz,
  ADD COLUMN IF NOT EXISTS unsubscribe_token text UNIQUE
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
UPDATE shop_users SET unsubscribe_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  WHERE unsubscribe_token IS NULL;
ALTER TABLE shop_users DROP CONSTRAINT IF EXISTS shop_users_email_or_phone;
ALTER TABLE shop_users ADD CONSTRAINT shop_users_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- ── Magic link tokens + sessioner (kun SHA-256 hash gemmes) ────────────────────────
CREATE TABLE IF NOT EXISTS shop_login_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_user_id uuid NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_login_tokens_user ON shop_login_tokens(shop_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_user_id uuid NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Købsdato: importerede ordrer får deres oprindelige dato her ───────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
UPDATE orders SET ordered_at = COALESCE(woo_created_at, created_at) WHERE ordered_at IS NULL;
ALTER TABLE orders ALTER COLUMN ordered_at SET DEFAULT now();
ALTER TABLE orders ALTER COLUMN ordered_at SET NOT NULL;

-- ── Forventet levetid pr. produkt ─────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS expected_lifespan_months int
    CHECK (expected_lifespan_months IS NULL OR expected_lifespan_months BETWEEN 1 AND 600),
  ADD COLUMN IF NOT EXISTS lifespan_note text;   -- fx "Udskift patron og udløser"

-- ── Sendte påmindelser (højst én pr. kunde/ordre/produkt) ──────────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_user_id uuid NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_user_id, order_id, product_id)
);

ALTER TABLE shop_login_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_login_tokens, shop_sessions, lifecycle_reminders FROM anon, authenticated;

-- ── Købte produkter med levetid → forfaldsdato ────────────────────────────────────
-- Absorberede varianter (variant_of_product_id) arver levetid fra overproduktet.
-- product_id sammenlignes som tekst, så gamle ordrelinjer med ikke-UUID-id'er ikke fejler.
CREATE OR REPLACE VIEW customer_product_lifecycle WITH (security_invoker = true) AS
SELECT
  o.shop_user_id,
  u.email,
  u.phone,
  u.name                                              AS customer_name,
  u.marketing_opt_in,
  o.id                                                AS order_id,
  o.order_number,
  o.ordered_at                                        AS purchased_at,
  p.id                                                AS product_id,
  NULLIF(li->>'variant_id', '')                       AS variant_id,
  COALESCE(NULLIF(li->>'name', ''), p.name)           AS line_name,
  CASE WHEN li->>'qty' ~ '^\d+$' THEN (li->>'qty')::int ELSE 1 END AS qty,
  COALESCE(p.expected_lifespan_months, pp.expected_lifespan_months) AS lifespan_months,
  COALESCE(p.lifespan_note, pp.lifespan_note)         AS lifespan_note,
  (o.ordered_at + make_interval(months => COALESCE(p.expected_lifespan_months, pp.expected_lifespan_months)))::date AS due_date,
  COALESCE(pp.id, p.id)                               AS shop_product_id,
  img.url                                             AS image_url,
  r.sent_at                                           AS reminded_at
FROM orders o
JOIN shop_users u ON u.id = o.shop_user_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.line_items) = 'array' THEN o.line_items ELSE '[]'::jsonb END
) li
JOIN products p        ON p.id::text = li->>'product_id'
LEFT JOIN products pp  ON pp.id = p.variant_of_product_id
LEFT JOIN LATERAL (
  SELECT url FROM product_images pi
  WHERE pi.product_id = COALESCE(pp.id, p.id)
  ORDER BY is_primary DESC, position LIMIT 1
) img ON true
LEFT JOIN lifecycle_reminders r
  ON r.shop_user_id = o.shop_user_id AND r.order_id = o.id AND r.product_id = p.id
WHERE o.status NOT IN ('cancelled', 'refunded')
  AND COALESCE(p.expected_lifespan_months, pp.expected_lifespan_months) IS NOT NULL;

REVOKE ALL ON customer_product_lifecycle FROM anon, authenticated;

-- ── Knyt ordrer til kunden via det identifikator kunden lige har bekræftet ─────────
-- Kun den kanal der er verificeret (e-mail ELLER telefon) bruges, så ingen kan "overtage"
-- ordrer ved at skrive en andens telefonnummer i checkout.
CREATE OR REPLACE FUNCTION link_orders_to_shop_user(p_user uuid, p_channel text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_email text; v_phone8 text; v_count int := 0;
BEGIN
  SELECT lower(email), right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8)
    INTO v_email, v_phone8 FROM shop_users WHERE id = p_user;

  IF p_channel = 'email' AND v_email IS NOT NULL THEN
    UPDATE orders SET shop_user_id = p_user
     WHERE shop_user_id IS NULL
       AND lower(coalesce(email, customer_info->>'email')) = v_email;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_channel = 'sms' AND length(v_phone8) = 8 THEN
    UPDATE orders SET shop_user_id = p_user
     WHERE shop_user_id IS NULL
       AND right(regexp_replace(coalesce(customer_info->>'phone', ''), '\D', '', 'g'), 8) = v_phone8;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION link_orders_to_shop_user(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT ALL ON shop_login_tokens, shop_sessions, lifecycle_reminders TO service_role;
GRANT SELECT ON customer_product_lifecycle TO service_role;
GRANT EXECUTE ON FUNCTION link_orders_to_shop_user(uuid, text) TO service_role;
