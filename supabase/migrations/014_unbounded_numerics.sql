-- Migration 014: Remove precision limits on numeric columns
-- NUMERIC without precision/scale stores arbitrary-size numbers in PostgreSQL

-- products table
ALTER TABLE products
  ALTER COLUMN sales_price           TYPE numeric,
  ALTER COLUMN sale_price            TYPE numeric,
  ALTER COLUMN weight                TYPE numeric,
  ALTER COLUMN length                TYPE numeric,
  ALTER COLUMN width                 TYPE numeric,
  ALTER COLUMN height                TYPE numeric;

-- product_suppliers table
ALTER TABLE product_suppliers
  ALTER COLUMN purchase_price            TYPE numeric,
  ALTER COLUMN recommended_sales_price   TYPE numeric,
  ALTER COLUMN previous_purchase_price   TYPE numeric;
