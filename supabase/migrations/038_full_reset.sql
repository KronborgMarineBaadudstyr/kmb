-- Migration 038: Fuld nulstilling af pipeline-arbejde
-- Sletter alle draft-produkter, match-grupper, auto-log
-- og frigør alle staging-rækker til pending_review.
-- Køres manuelt i Supabase SQL Editor.

-- 1. Slet auto-handling log
TRUNCATE pipeline_auto_actions;

-- 2. Frigør alle staging-rækker
UPDATE supplier_product_staging
SET match_group_id = NULL,
    status         = 'pending_review',
    updated_at     = now();

-- 3. Slet alle match-grupper
TRUNCATE staging_match_groups;

-- 4. Slet pipeline-oprettede draft-produkter og alt tilknyttet
DELETE FROM product_images
WHERE product_id IN (SELECT id FROM products WHERE status = 'draft');

DELETE FROM product_suppliers
WHERE product_id IN (SELECT id FROM products WHERE status = 'draft');

DELETE FROM products WHERE status = 'draft';

-- Resultat
SELECT
  (SELECT COUNT(*) FROM supplier_product_staging WHERE status = 'pending_review') AS staging_pending,
  (SELECT COUNT(*) FROM staging_match_groups)                                      AS match_groups,
  (SELECT COUNT(*) FROM products WHERE status = 'draft')                          AS draft_products,
  (SELECT COUNT(*) FROM pipeline_auto_actions)                                    AS auto_actions;
