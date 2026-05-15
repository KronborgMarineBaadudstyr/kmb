-- Migration 015: Add boat_type to products + reset product_types for new category structure

-- 1. Add boat_type column to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS boat_type text[] DEFAULT '{}';

-- 2. Clear product_types — starting fresh with new category structure
TRUNCATE TABLE product_types RESTART IDENTITY CASCADE;

-- 3. Add suggested_boat_type column to product_types
ALTER TABLE product_types
  ADD COLUMN IF NOT EXISTS suggested_boat_type text[] DEFAULT '{}';
