-- Migration 055: Betal ved afhentning for kendte kunder
-- Kør efter 054.

-- NULL = automatisk (har handlet før), true = altid tilladt, false = aldrig (fx ikke afhentet før)
ALTER TABLE shop_users ADD COLUMN IF NOT EXISTS pay_at_pickup_allowed boolean;

-- 'online' (betalingsudbyder) eller 'pickup' (betales i butikken ved afhentning)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at       timestamptz;  -- klar til afhentning
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
