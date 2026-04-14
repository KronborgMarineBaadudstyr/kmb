-- ============================================================
-- Migration 006: Scanmarine leverandør
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM suppliers WHERE name = 'Scanmarine') THEN
    UPDATE suppliers
    SET
      data_format         = 'api',
      api_url             = 'https://scanmarine.dk/api/produkter',
      api_format          = 'csv',
      api_auth_type       = 'none',
      sync_interval_hours = 24,
      active              = true,
      notes               = 'CSV-fil via direkte HTTP-link. Semikolon-separeret, dansk talformat (355,00). Opdateres dagligt.',
      field_mapping       = '{
        "match_on": [
          {"supplier_field": "ean_number",      "supabase_field": "products.ean",              "confidence": "high"},
          {"supplier_field": "product_number",  "supabase_field": "products.manufacturer_sku", "confidence": "medium"}
        ],
        "map_to_products": {
          "product_name":  "name",
          "product_s_desc":"short_description",
          "product_desc":  "description",
          "ean_number":    "ean",
          "product_price": "sales_price",
          "weight":        "weight"
        },
        "map_to_product_suppliers": {
          "product_number":  "supplier_sku",
          "product_name":    "supplier_product_name",
          "product_price":   "recommended_sales_price",
          "stock":           "supplier_stock_quantity"
        }
      }'::jsonb
    WHERE name = 'Scanmarine';
  ELSE
    INSERT INTO suppliers (
      name, data_format, api_url, api_format, api_auth_type,
      sync_interval_hours, active, notes, field_mapping
    ) VALUES (
      'Scanmarine',
      'api',
      'https://scanmarine.dk/api/produkter',
      'csv',
      'none',
      24,
      true,
      'CSV-fil via direkte HTTP-link. Semikolon-separeret, dansk talformat (355,00). Opdateres dagligt.',
      '{
        "match_on": [
          {"supplier_field": "ean_number",      "supabase_field": "products.ean",              "confidence": "high"},
          {"supplier_field": "product_number",  "supabase_field": "products.manufacturer_sku", "confidence": "medium"}
        ],
        "map_to_products": {
          "product_name":  "name",
          "product_s_desc":"short_description",
          "product_desc":  "description",
          "ean_number":    "ean",
          "product_price": "sales_price",
          "weight":        "weight"
        },
        "map_to_product_suppliers": {
          "product_number":  "supplier_sku",
          "product_name":    "supplier_product_name",
          "product_price":   "recommended_sales_price",
          "stock":           "supplier_stock_quantity"
        }
      }'::jsonb
    );
  END IF;
END $$;
