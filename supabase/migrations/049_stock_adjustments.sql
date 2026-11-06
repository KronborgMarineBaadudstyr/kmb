-- 049: Stock adjustments table for own inventory
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id   uuid        REFERENCES product_variants(id) ON DELETE CASCADE,
  delta        integer     NOT NULL,                        -- positive = tilgang, negative = afgang
  field        text        NOT NULL DEFAULT 'own_stock_quantity'
                           CHECK (field IN ('own_stock_quantity', 'own_stock_reserved')),
  reason       text        NOT NULL
                           CHECK (reason IN (
                             'physical_count',   -- Fysisk optælling
                             'received',         -- Varer modtaget
                             'sold',             -- Solgt (manuel)
                             'damaged',          -- Beskadiget / kasseret
                             'returned',         -- Returneret fra kunde
                             'correction',       -- Korrektion / fejlretning
                             'reservation',      -- Manuel reservation
                             'reservation_release' -- Frigivelse af reservation
                           )),
  note         text,
  created_by   text        DEFAULT 'admin',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_adjustments_product_id_idx ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_created_at_idx ON stock_adjustments(created_at DESC);
