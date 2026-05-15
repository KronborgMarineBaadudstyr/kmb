-- Migration 016: Parent-child variant relationships on products

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_attributes jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_product_id);
