-- Migration 046: Publicér draft-produkter der er oprettet fra bekræftede match-grupper
-- Kun produkter der har en product_created-gruppe i staging_match_groups sættes til published.
-- Draft-produkter uden tilknyttet bekræftet gruppe forbliver draft.

UPDATE products p
SET    status = 'published', updated_at = now()
WHERE  p.status = 'draft'
  AND  EXISTS (
    SELECT 1 FROM staging_match_groups smg
    WHERE  smg.product_id = p.id
      AND  smg.status = 'product_created'
  );
