-- Migration 052: orders udvides til egne webshop-ordrer
-- Tabellen blev oprettet til Woo-ordrer (woo_order_id NOT NULL). Eksisterende rækker beholdes
-- og markeres source = 'woo'. Nye ordrer fra LoveSailing.dk får source = 'webshop'.

ALTER TABLE orders ALTER COLUMN woo_order_id DROP NOT NULL;

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 10001;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'woo',
  ADD COLUMN IF NOT EXISTS order_number      text UNIQUE DEFAULT ('LS-' || nextval('order_number_seq')),
  ADD COLUMN IF NOT EXISTS shop_user_id      uuid REFERENCES shop_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS subtotal          numeric(10,2),
  ADD COLUMN IF NOT EXISTS customer_note     text,
  -- unpaid / paid / failed / refunded
  ADD COLUMN IF NOT EXISTS payment_status    text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_provider  text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  -- Hemmeligt token i kvitterings-linket (kunden er ikke logget ind)
  ADD COLUMN IF NOT EXISTS access_token      text UNIQUE;

-- Nye rækker er webshop-ordrer (eksisterende rækker fik 'woo' ovenfor)
ALTER TABLE orders ALTER COLUMN source SET DEFAULT 'webshop';

CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_user_id ON orders(shop_user_id);

-- saved_carts.token havde DEFAULT encode(..., 'base64url'), som kræver PostgreSQL 18.
-- Appen sætter nu selv token; default ændres til noget der virker på alle versioner.
ALTER TABLE saved_carts
  ALTER COLUMN token SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
