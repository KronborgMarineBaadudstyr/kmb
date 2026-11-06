-- Migration 046: Publicér eksisterende draft-produkter der opfylder publiceringsreglerne
-- Regler: oprettet fra bekræftet gruppe (single/ean/variant/parent_sku) + har pris + billede + beskrivelse

UPDATE products p
SET    status = 'published', updated_at = now()
WHERE  p.status = 'draft'
  -- Kom fra en bekræftet gruppe med entydig match-metode
  AND EXISTS (
    SELECT 1 FROM staging_match_groups smg
    WHERE  smg.product_id = p.id
      AND  smg.status     = 'product_created'
      AND  smg.match_method IN ('single', 'ean', 'variant', 'parent_sku')
  )
  -- Har pris
  AND p.sales_price IS NOT NULL AND p.sales_price > 0
  -- Har billede
  AND EXISTS (
    SELECT 1 FROM product_images pi WHERE pi.product_id = p.id LIMIT 1
  )
  -- Har beskrivelse
  AND p.description IS NOT NULL AND length(trim(p.description)) > 10;
