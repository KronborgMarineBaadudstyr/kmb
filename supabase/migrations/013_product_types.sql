-- ============================================================
-- Migration 013: Product types — variant rules + our taxonomy
-- ============================================================

CREATE TABLE product_types (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text NOT NULL,           -- "Ankerkæde"
  keywords            text[] NOT NULL,          -- '{ankerkæde,kæde}'
  variant_attributes  jsonb NOT NULL DEFAULT '[]',
  -- [{"unit":"mm","name":"Godstyklelse"},{"unit":"m","name":"Længde"}]
  our_category        text,                    -- "Ankre & fortøjning"
  our_subcategory     text,
  notes               text,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_types_keywords ON product_types USING gin(keywords);

CREATE TRIGGER product_types_updated_at
  BEFORE UPDATE ON product_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
