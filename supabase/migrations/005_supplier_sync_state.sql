-- ============================================================
-- Migration 005: sync_state på suppliers
-- Bruges til at tracke hvilke delta-filer der er behandlet
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS sync_state jsonb NOT NULL DEFAULT '{}';

-- Eksempel på indhold efter første stock-delta kørsel:
-- {
--   "last_stock_delta_ts": "20250414143000",  -- timestamp fra seneste behandlede delta-fil
--   "last_full_product_sync": "2025-04-14T22:00:00Z"
-- }
