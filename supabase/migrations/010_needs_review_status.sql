-- Migration 010: Tilføj 'needs_review' status til supplier_product_staging
-- Bruges til matchede produkter hvor det linkede products-produkt mangler data
-- (ikke i salg i Woo/POS, mangler beskrivelse, eller mangler salgspris)

ALTER TABLE supplier_product_staging
  DROP CONSTRAINT staging_status_check,
  ADD CONSTRAINT staging_status_check
    CHECK (status IN ('pending_review', 'matched', 'new_product', 'rejected', 'needs_review'));

COMMENT ON COLUMN supplier_product_staging.status IS
  'pending_review: afventer matching til eksisterende produkt
   matched: manuelt matchet til eksisterende produkt
   new_product: godkendt som nyt draft-produkt
   rejected: afvist (duplikat, fejl osv.)
   needs_review: matchet produkt med manglende/ufuldstændigt data i products-tabellen';
