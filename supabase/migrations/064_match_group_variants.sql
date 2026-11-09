-- Migration 064: Admin vælger "samme vare" eller "varianter" på en match-gruppe (Saml ens varer)
-- create_as:          'same' = ét produkt med flere leverandører, 'variants' = ét produkt med varianter.
--                     NULL = som før (variant/parent_sku-grupper → varianter, resten → samme vare)
-- member_attributes:  { "<staging-id>": [{"name":"Størrelse","value":"M"}, ...], ... } — egenskaberne pr. vare.
--                     Gemmes på gruppen (ikke i raw_data), så natlig import ikke overskriver dem før oprettelse.

ALTER TABLE staging_match_groups
  ADD COLUMN IF NOT EXISTS create_as text CHECK (create_as IN ('same', 'variants')),
  ADD COLUMN IF NOT EXISTS member_attributes jsonb;
