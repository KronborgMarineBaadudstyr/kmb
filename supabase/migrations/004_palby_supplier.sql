-- ============================================================
-- Migration 004: Palby leverandør
-- ============================================================

DO $$
DECLARE
  v_field_mapping jsonb := '{
    "match_on": [
      {"supplier_field": "ItemEan",  "supabase_field": "products.ean",              "confidence": "high"},
      {"supplier_field": "ItemId",   "supabase_field": "products.manufacturer_sku", "confidence": "medium"}
    ],
    "map_to_products": {
      "ItemCaption":       "name",
      "ShortTxt":          "short_description",
      "DescriptionTxt":    "description",
      "ItemEan":           "ean",
      "GrossSalesPrice":   "sales_price",
      "GrossWeight":       "weight",
      "ItemBrand":         "brand"
    },
    "map_to_product_suppliers": {
      "ItemId":              "supplier_sku",
      "ItemCaption":         "supplier_product_name",
      "SalesPrice":          "purchase_price",
      "GrossSalesPrice":     "recommended_sales_price",
      "OnHandAvailPhysical": "supplier_stock_quantity",
      "LowestQty":           "moq"
    },
    "xml_product_file":       "webcataloginventitems_cust_newitemid.xml",
    "xml_stock_file":         "web_stockstatus_newitemid.xml",
    "xml_stock_delta_prefix": "web_stockstatus_newitemid_delta_",
    "catalog_filter":         "Kompakt"
  }'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM suppliers WHERE name = 'Palby') THEN
    UPDATE suppliers
    SET
      data_format   = 'ftp',
      ftp_path      = '/webcataloginventitems_cust_newitemid.xml',
      ftp_protocol  = 'ftp',
      ftp_port      = 21,
      sync_interval_hours = 24,
      active        = true,
      notes         = 'File-baseret API via FTP. Produktdata XML opdateres dagligt kl. 22. Lagerstatus delta opdateres hvert 15. min.',
      field_mapping = v_field_mapping
    WHERE name = 'Palby';
  ELSE
    INSERT INTO suppliers (
      name, data_format, ftp_host, ftp_port, ftp_user, ftp_password,
      ftp_path, ftp_protocol, sync_interval_hours, active, notes, field_mapping
    ) VALUES (
      'Palby', 'ftp', '', 21, '', '',
      '/webcataloginventitems_cust_newitemid.xml', 'ftp', 24, true,
      'File-baseret API via FTP. Produktdata XML opdateres dagligt kl. 22. Lagerstatus delta opdateres hvert 15. min.',
      v_field_mapping
    );
  END IF;
END $$;
