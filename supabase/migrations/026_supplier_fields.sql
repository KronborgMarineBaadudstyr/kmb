-- 026_supplier_fields.sql
-- Nye dedikerede kolonner på product_suppliers til data vi tidligere
-- gemte i extra_data eller slet ikke gemte.

-- ── product_suppliers: nye kolonner ─────────────────────────────────────────

-- Forventet hjemkomstsato ved udsolgt (Columbus: InStockExpected)
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS in_stock_expected_date date;

-- Salgsenhed fra leverandøren (Engholm: unit, HF Industri: enhed)
-- Eksempler: 'stk', 'm', 'rulle', 'pakke', 'par'
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS unit text;

-- Leverandørens egen rabat-% (Scanmarine: product_discount)
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS supplier_discount_pct numeric(5,2);

-- Leverandørens producentvarenummer — udfyldes fra ManufacturerItemId (Palby),
-- nautiskVarenr (Engholm), KH-Child-Vnr (Kap-Horn), MPS-Child-Vnr (Kap-Horn)
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS manufacturer_sku text;

-- Variant-attributter fra leverandørens feed (Kap-Horn: Farve, Size1-2; Palby: VariantName)
-- Gemmes som jsonb array: [{"name":"Farve","value":"Rød"},{"name":"Størrelse","value":"10mm"}]
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS supplier_variant_attributes jsonb;

-- Variant-gruppe SKU fra leverandøren (Palby: MasterItemId, Kap-Horn: Baltic-Parent-Vnr-Pointer)
-- Bruges til at gruppere varianter under samme produkt ved import
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS supplier_parent_sku text;

-- Kap-Horn GrandParent (øverste hierarki-niveau)
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS supplier_grandparent_sku text;

-- Tilbehørs-SKUs fra leverandøren (Kap-Horn: Accessories1-3BAL)
-- Bruges til cross-sell / "passer til" funktionalitet
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS accessories_skus text[];

-- Relaterede SKUs fra leverandøren (Kap-Horn: Related1-3BAL)
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS related_skus text[];

-- Indeks der hjælper med variant-gruppering på tværs af leverandørimports
CREATE INDEX IF NOT EXISTS idx_product_suppliers_parent_sku
  ON product_suppliers (supplier_id, supplier_parent_sku)
  WHERE supplier_parent_sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_suppliers_manufacturer_sku
  ON product_suppliers (supplier_id, manufacturer_sku)
  WHERE manufacturer_sku IS NOT NULL;

COMMENT ON COLUMN product_suppliers.in_stock_expected_date IS 'Forventet hjemkomstsato (Columbus: InStockExpected)';
COMMENT ON COLUMN product_suppliers.unit                   IS 'Salgsenhed fra leverandør (stk/m/rulle/pakke)';
COMMENT ON COLUMN product_suppliers.supplier_discount_pct  IS 'Leverandørens standard rabat-% (Scanmarine: product_discount)';
COMMENT ON COLUMN product_suppliers.manufacturer_sku       IS 'Producentens eget varenr. (Palby: ManufacturerItemId, Engholm: nautiskVarenr)';
COMMENT ON COLUMN product_suppliers.supplier_variant_attributes IS 'Variant-attributter fra feed: [{"name":"Farve","value":"Rød"}]';
COMMENT ON COLUMN product_suppliers.supplier_parent_sku    IS 'Overordnet gruppe-SKU til variant-gruppering (Palby: MasterItemId, Kap-Horn: Baltic-Parent-Vnr-Pointer)';
COMMENT ON COLUMN product_suppliers.accessories_skus       IS 'Tilbehørs-SKU referencer fra leverandørens feed (Kap-Horn: Accessories1-3BAL)';
COMMENT ON COLUMN product_suppliers.related_skus           IS 'Relaterede produkt-SKU referencer (Kap-Horn: Related1-3BAL)';
