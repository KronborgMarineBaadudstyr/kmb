-- 022_stock_visibility.sql
-- Styrer om produkt/variant vises i shoppen baseret på lokalt lager
-- Hvis hide_when_out_of_stock = true OG own_stock_quantity = 0 → skjul i shop

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hide_when_out_of_stock boolean NOT NULL DEFAULT false;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS hide_when_out_of_stock boolean NOT NULL DEFAULT false;

-- Index til effektiv filtrering fra lovesaling.dk's API-kald
CREATE INDEX IF NOT EXISTS products_hide_oos_idx
  ON products (hide_when_out_of_stock, own_stock_quantity)
  WHERE hide_when_out_of_stock = true;

CREATE INDEX IF NOT EXISTS product_variants_hide_oos_idx
  ON product_variants (hide_when_out_of_stock, own_stock_quantity)
  WHERE hide_when_out_of_stock = true;

COMMENT ON COLUMN products.hide_when_out_of_stock IS
  'Hvis true: skjul produktet i webshop når own_stock_quantity = 0';

COMMENT ON COLUMN product_variants.hide_when_out_of_stock IS
  'Hvis true: skjul varianten i webshop når own_stock_quantity = 0';
