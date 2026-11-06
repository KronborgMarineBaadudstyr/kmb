-- Migration 046: Sæt eksisterende draft-produkter til published
-- Produkter oprettet via pipeline skal være published med det samme.
-- Draft bruges herefter kun til produkter der er manuelt sat på hold.

UPDATE products
SET    status = 'published', updated_at = now()
WHERE  status = 'draft';
