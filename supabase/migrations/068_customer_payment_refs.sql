-- Migration 068: Kunden genkendes på delvist kortnummer
-- Når en ordre betales med kort (i butikken ved afhentning, senere via admind POS eller Swedbank Pay online),
-- gemmes KUN de sidste 4 cifre (og evt. de første 6 = kortudsteder/BIN, korttype og udløb) — aldrig det fulde
-- kortnummer. Bruges til at slå kunden op: "Er det en af disse kunder?" (Kunder → Find via kort).

CREATE TABLE IF NOT EXISTS customer_payment_refs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_user_id   uuid        NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
  card_last4     text        NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  card_bin       text        CHECK (card_bin ~ '^[0-9]{6,8}$'),
  card_brand     text,
  card_expiry    text        CHECK (card_expiry ~ '^[0-9]{2}/[0-9]{2}$'),
  source         text        NOT NULL CHECK (source IN ('pos', 'online', 'manual')),
  times_seen     int         NOT NULL DEFAULT 1,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_order_id  uuid        REFERENCES orders(id) ON DELETE SET NULL
);

-- Samme kort på samme kunde = én række (udsteder/udløb kan mangle)
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_refs_unique
  ON customer_payment_refs (shop_user_id, card_last4, coalesce(card_bin, ''), coalesce(card_expiry, ''));
CREATE INDEX IF NOT EXISTS customer_payment_refs_last4 ON customer_payment_refs (card_last4);

-- Kortet ordren blev betalt med: { last4, bin?, brand?, expiry?, source }
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_card jsonb;

ALTER TABLE customer_payment_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_payment_refs FROM anon, authenticated;
GRANT ALL ON customer_payment_refs TO service_role;
