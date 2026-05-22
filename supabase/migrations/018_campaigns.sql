-- 018_campaigns.sql
-- Kampagnesystem: individuelle rabatter, mængderabatter og kit-tilbud

CREATE TABLE IF NOT EXISTS campaigns (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  description   text,
  type          text        NOT NULL CHECK (type IN ('individual', 'bundle_qty', 'bundle_kit')),
  -- individual  = sale_price på hver valgt vare
  -- bundle_qty  = rabat når kunden køber mindst X af SAMME vare
  -- bundle_kit  = rabat/fast-pris når kunden køber ALLE valgte varer sammen

  discount_type text        NOT NULL CHECK (discount_type IN ('percentage', 'fixed_price', 'fixed_amount')),
  -- percentage  = % rabat af salgspris
  -- fixed_price = fast pris (erstatter salgspris)
  -- fixed_amount= fast beløb i rabat

  discount_value numeric,       -- %-sats, fast pris eller beløb
  bundle_qty     integer,       -- min. antal for bundle_qty kampagner
  kit_price      numeric,       -- samlet pris for alle kit-produkter (bundle_kit)

  start_date     date,
  end_date       date,
  status         text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'active', 'ended')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_products (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid    NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  product_id  uuid    NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  -- Override per produkt — bruges primært til individual-kampagner
  -- Hvis NULL: udregnes fra campaign.discount_type + campaign.discount_value
  sale_price  numeric,
  UNIQUE (campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS campaign_products_campaign_id_idx ON campaign_products (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_products_product_id_idx  ON campaign_products (product_id);
