-- Migration 070: Log over betalinger (Swedbank Pay)
-- Hver hændelse på en ordres betaling: oprettet, reserveret, trukket, annulleret, fejl — til fejlsøgning og afstemning.

CREATE TABLE IF NOT EXISTS payment_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_order ON payment_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders (payment_reference);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_events FROM anon, authenticated;
GRANT ALL ON payment_events TO service_role;
