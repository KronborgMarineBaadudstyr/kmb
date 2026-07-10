-- Migration 036: pipeline_auto_actions log table
-- Records every automatic action taken by the pipeline's auto-staging step:
--   auto_match  — staging row linked to an existing product (score ≥ 0.85)
--   auto_create — staging row created as a new draft product (no match found)
-- Supports audit, search, and revert from the admin log UI.

CREATE TABLE IF NOT EXISTS pipeline_auto_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  pipeline_run_id text        NOT NULL,          -- ISO timestamp of the pipeline run
  action_type     text        NOT NULL CHECK (action_type IN ('auto_match', 'auto_create')),
  staging_id      uuid        REFERENCES supplier_product_staging(id) ON DELETE SET NULL,
  product_id      uuid        REFERENCES products(id) ON DELETE SET NULL,
  supplier_id     uuid        REFERENCES suppliers(id) ON DELETE SET NULL,
  match_score     float,                          -- similarity score (auto_match only)
  staging_name    text        NOT NULL,
  product_name    text        NOT NULL,
  status          text        NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'reverted')),
  reverted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS pipeline_auto_actions_created_at_idx  ON pipeline_auto_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_auto_actions_product_id_idx  ON pipeline_auto_actions (product_id);
CREATE INDEX IF NOT EXISTS pipeline_auto_actions_staging_id_idx  ON pipeline_auto_actions (staging_id);
CREATE INDEX IF NOT EXISTS pipeline_auto_actions_run_id_idx      ON pipeline_auto_actions (pipeline_run_id);
CREATE INDEX IF NOT EXISTS pipeline_auto_actions_status_idx      ON pipeline_auto_actions (status);
