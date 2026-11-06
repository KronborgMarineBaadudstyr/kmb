-- 048: Add 'skipped' to staging_match_groups status constraint
ALTER TABLE staging_match_groups
  DROP CONSTRAINT match_groups_status_check,
  ADD CONSTRAINT match_groups_status_check
    CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'product_created', 'skipped'));
