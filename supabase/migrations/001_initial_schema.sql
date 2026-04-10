-- ============================================================
-- Kronborg Marine Bådudstyr Middleware — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MANUFACTURERS (Producenter)
-- ============================================================
CREATE TABLE manufacturers (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  country     text,
  website     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTS (Centralt produktkatalog — vores master)
-- ============================================================
CREATE TABLE products (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_sku          text UNIQUE NOT NULL,   -- VORES eget varenummer
  name                  text NOT NULL,
  description           text,
  short_description     text,

  -- Producent
  manufacturer_id       uuid REFERENCES manufacturers(id) ON DELETE SET NULL,
  manufacturer_sku      text,    -- producent varenr. — nøgle til cross-supplier matching

  -- Eget lager i butikken (altid højeste prioritet ved opfyldning)
  own_stock_quantity    int NOT NULL DEFAULT 0,
  own_stock_reserved    int NOT NULL DEFAULT 0,  -- reserveret til igangværende ordre

  -- Vores salgspriser (synkes til Woo/POS)
  sales_price           numeric(10,2),
  sale_price            numeric(10,2),           -- tilbudspris
  tax_class             text,

  -- Mål & fragt
  weight                numeric(8,3),
  length                numeric(8,2),
  width                 numeric(8,2),
  height                numeric(8,2),

  -- Indhold & media
  specifications        jsonb,     -- strukturerede specifikationer (fra Woo: specifikationer ACF)
  ean                   text,      -- stregkode/EAN
  video_url             text,

  -- Kategorisering
  categories            text[],
  tags                  text[],
  attributes            jsonb,     -- [{name, value}] ikke-variant attributter (Køn, Farve, etc.)
  brand                 text,

  -- SEO
  slug                  text,
  meta_title            text,
  meta_description      text,

  -- Sync med eksterne systemer
  woo_product_id        bigint,    -- WooCommerce produkt-ID
  pos_product_id        text,      -- admind POS ID
  woo_bestillingsnummer text,      -- fra Woo meta: bestillingsnummer

  -- Status
  status                text NOT NULL DEFAULT 'draft',
                        -- draft / validated / published
  woo_sync_status       text,      -- synced / pending / error

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_synced_woo_at    timestamptz,
  last_synced_pos_at    timestamptz,

  CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'validated', 'published'))
);

CREATE INDEX idx_products_internal_sku     ON products(internal_sku);
CREATE INDEX idx_products_manufacturer_sku ON products(manufacturer_sku);
CREATE INDEX idx_products_woo_product_id   ON products(woo_product_id);
CREATE INDEX idx_products_status           ON products(status);

-- ============================================================
-- PRODUCT VARIANTS (Størrelser, farver etc.)
-- ============================================================
CREATE TABLE product_variants (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id            uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  internal_variant_sku  text UNIQUE NOT NULL,  -- VORES eget variant-varenummer
  attributes            jsonb NOT NULL,
  -- [{name:'Størrelse',value:'L'},{name:'Farve',value:'Rød'}]

  -- Eget lager for denne variant
  own_stock_quantity    int NOT NULL DEFAULT 0,
  own_stock_reserved    int NOT NULL DEFAULT 0,

  -- Prisoverskrivning (NULL = arv fra parent product)
  sales_price           numeric(10,2),
  sale_price            numeric(10,2),
  ean                   text,
  weight                numeric(8,3),

  -- Sync
  woo_variation_id      bigint,
  status                text NOT NULL DEFAULT 'active',
                        -- active / discontinued

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_variants_status_check
    CHECK (status IN ('active', 'discontinued'))
);

CREATE INDEX idx_product_variants_product_id       ON product_variants(product_id);
CREATE INDEX idx_product_variants_woo_variation_id ON product_variants(woo_variation_id);

-- ============================================================
-- SUPPLIERS (Leverandør stamdata)
-- ============================================================
CREATE TABLE suppliers (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  text NOT NULL,
  contact_name          text,
  contact_email         text,
  contact_phone         text,

  -- Import-konfiguration
  data_format           text,   -- excel / api / ftp / manual

  -- FTP adgang
  ftp_host              text,
  ftp_port              int DEFAULT 21,
  ftp_user              text,
  ftp_password          text,   -- bør krypteres i applikationslaget
  ftp_path              text,
  ftp_protocol          text DEFAULT 'ftp',  -- ftp / sftp / ftps

  -- API adgang
  api_url               text,
  api_key               text,
  api_format            text,   -- json / xml / csv
  api_auth_type         text,   -- bearer / basic / oauth

  -- Excel kolonne-mapping
  -- Eksempel: {"Varenr":"supplier_sku","Indkøbspris":"purchase_price","Lager":"supplier_stock_quantity"}
  excel_column_mapping  jsonb,
  excel_sheet_name      text,

  -- Sync-schedule
  sync_interval_hours   int DEFAULT 24,
  last_synced_at        timestamptz,

  active                boolean NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCT_SUPPLIERS — Produkt ↔ Leverandør (KERNETABEL)
-- Én række per (produkt/variant × leverandør)
-- ============================================================
CREATE TABLE product_suppliers (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id                uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id                uuid REFERENCES product_variants(id) ON DELETE CASCADE,
                            -- NULL = gælder hele produktet (simple produkt)
  supplier_id               uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,

  -- Prioritet for opfyldning (eget lager er altid implicit #0)
  -- 1 = primær leverandør, 2 = sekundær, osv.
  priority                  int NOT NULL DEFAULT 1,
  is_active                 boolean NOT NULL DEFAULT true,

  -- Leverandørens varenr. og navn
  supplier_sku              text NOT NULL,
  supplier_product_name     text,    -- leverandørens navn for varen (kan afvige fra vores)

  -- Priser fra leverandøren
  purchase_price            numeric(10,2),          -- indkøbspris (excl. moms)
  recommended_sales_price   numeric(10,2),          -- leverandørens vejledende salgspris
  previous_purchase_price   numeric(10,2),          -- forrige indkøbspris (prisændringshistorik)

  -- Logistik
  delivery_days_min         int,     -- leveringstid min dage
  delivery_days_max         int,     -- leveringstid max dage
  moq                       int NOT NULL DEFAULT 1, -- minimum order quantity

  -- Leverandørens lagerbeholdning
  supplier_stock_quantity   int NOT NULL DEFAULT 0,
  supplier_stock_reserved   int NOT NULL DEFAULT 0, -- hvad VI har reserveret hos leverandøren
  supplier_stock_updated_at timestamptz,

  -- Varestatus fra leverandøren
  item_status               text NOT NULL DEFAULT 'active',
                            -- active / new / price_changed / discontinued / out_of_stock
  item_status_changed_at    timestamptz,

  -- Rå billeder og filer fra DENNE leverandør
  -- Valideres og flyttes til product_images/product_files ved godkendelse
  supplier_images           jsonb,   -- [{url, alt, is_primary}]
  supplier_files            jsonb,   -- [{url, name, type:'manual'|'spec'|'other'}]

  -- Leverandørspecifik ekstradata (alt unikt pr. leverandør)
  extra_data                jsonb,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_suppliers_unique UNIQUE (product_id, variant_id, supplier_id),
  CONSTRAINT product_suppliers_priority_positive CHECK (priority > 0),
  CONSTRAINT product_suppliers_item_status_check
    CHECK (item_status IN ('active', 'new', 'price_changed', 'discontinued', 'out_of_stock'))
);

CREATE INDEX idx_product_suppliers_product_id  ON product_suppliers(product_id);
CREATE INDEX idx_product_suppliers_supplier_id ON product_suppliers(supplier_id);
CREATE INDEX idx_product_suppliers_supplier_sku ON product_suppliers(supplier_id, supplier_sku);
CREATE INDEX idx_product_suppliers_item_status ON product_suppliers(item_status);

-- ============================================================
-- PRODUCT IMAGES (Vores egne godkendte billeder — Supabase Storage)
-- ============================================================
CREATE TABLE product_images (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      uuid REFERENCES product_variants(id) ON DELETE CASCADE,
                  -- NULL = gælder hele produktet
  storage_path    text,           -- Supabase Storage sti
  url             text NOT NULL,
  alt_text        text,
  position        int NOT NULL DEFAULT 0,
  is_primary      boolean NOT NULL DEFAULT false,
  source          text NOT NULL DEFAULT 'manual',  -- manual / supplier / woo
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- ============================================================
-- PRODUCT FILES (Vores egne godkendte PDF/filer)
-- ============================================================
CREATE TABLE product_files (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path    text,           -- Supabase Storage sti
  url             text NOT NULL,
  file_name       text NOT NULL,
  file_type       text NOT NULL DEFAULT 'manual',  -- manual / spec / certificate / other
  language        text NOT NULL DEFAULT 'da',
  position        int NOT NULL DEFAULT 0,
  source          text NOT NULL DEFAULT 'manual',  -- manual / supplier / woo
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_files_product_id ON product_files(product_id);

-- ============================================================
-- ORDERS (Kopi af Woo-ordre til lokal behandling og routing)
-- ============================================================
CREATE TABLE orders (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  woo_order_id        bigint UNIQUE NOT NULL,
  status              text NOT NULL,
                      -- pending / processing / completed / cancelled / refunded
  fulfillment_status  text NOT NULL DEFAULT 'unrouted',
                      -- unrouted / routed / approved / dispatched / delivered

  customer_info       jsonb,   -- {first_name, last_name, email, billing, shipping}
  line_items          jsonb,   -- [{product_id, variant_id, woo_product_id, sku, qty, price}]
  shipping_method     text,
  shipping_total      numeric(10,2),
  order_total         numeric(10,2),
  currency            text NOT NULL DEFAULT 'DKK',

  woo_created_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_woo_order_id       ON orders(woo_order_id);
CREATE INDEX idx_orders_fulfillment_status ON orders(fulfillment_status);

-- ============================================================
-- STOCK RESERVATIONS
-- Reserverer lager ved ordreindgang — FØR fysisk opfyldning
-- ============================================================
CREATE TABLE stock_reservations (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id            uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id            uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_supplier_id   uuid REFERENCES product_suppliers(id) ON DELETE RESTRICT,
                        -- NULL = reservation fra eget lager i butikken
  order_id              uuid REFERENCES orders(id) ON DELETE CASCADE,

  quantity              int NOT NULL CHECK (quantity > 0),
  status                text NOT NULL DEFAULT 'reserved',
                        -- reserved / fulfilled / cancelled
  reserved_at           timestamptz NOT NULL DEFAULT now(),
  fulfilled_at          timestamptz,
  cancelled_at          timestamptz,

  CONSTRAINT stock_reservations_status_check
    CHECK (status IN ('reserved', 'fulfilled', 'cancelled'))
);

CREATE INDEX idx_stock_reservations_product_id ON stock_reservations(product_id);
CREATE INDEX idx_stock_reservations_order_id   ON stock_reservations(order_id);
CREATE INDEX idx_stock_reservations_status     ON stock_reservations(status);

-- ============================================================
-- FULFILLMENT ROUTES (Forsendelsesoptimering)
-- ============================================================
CREATE TABLE fulfillment_routes (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  route_status        text NOT NULL DEFAULT 'suggested',
                      -- suggested / approved / sent
  -- Forsendelsesplan:
  -- [{source:'own_stock'|supplier_id, items:[{product_id,variant_id,qty}], supplier_name}]
  shipments           jsonb NOT NULL DEFAULT '[]',
  optimization_notes  text,
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fulfillment_routes_status_check
    CHECK (route_status IN ('suggested', 'approved', 'sent'))
);

CREATE INDEX idx_fulfillment_routes_order_id ON fulfillment_routes(order_id);

-- ============================================================
-- SUPPLIER IMPORTS (Log over import-kørsler)
-- ============================================================
CREATE TABLE supplier_imports (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  import_type         text NOT NULL,  -- excel / api / ftp / manual
  file_name           text,
  status              text NOT NULL DEFAULT 'running',
                      -- running / completed / failed
  records_total       int DEFAULT 0,
  records_created     int DEFAULT 0,
  records_updated     int DEFAULT 0,
  records_failed      int DEFAULT 0,
  new_items           int DEFAULT 0,      -- nye varer opdaget
  price_changes       int DEFAULT 0,      -- prisændringer
  discontinued_items  int DEFAULT 0,      -- udgåede varer
  error_log           jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX idx_supplier_imports_supplier_id ON supplier_imports(supplier_id);

-- ============================================================
-- SYNC LOG (Log over synkroniseringer til Woo/POS)
-- ============================================================
CREATE TABLE sync_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id  uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  target      text NOT NULL,   -- woo / pos
  action      text NOT NULL,   -- create / update / delete / stock_update
  status      text NOT NULL,   -- success / failed / pending
  payload     jsonb,
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_product_id ON sync_log(product_id);
CREATE INDEX idx_sync_log_status     ON sync_log(status);
CREATE INDEX idx_sync_log_created_at ON sync_log(created_at DESC);

-- ============================================================
-- INVENTORY EVENTS (Fuld audit-log for alle lagerændringer)
-- ============================================================
CREATE TABLE inventory_events (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id            uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id            uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_supplier_id   uuid REFERENCES product_suppliers(id) ON DELETE SET NULL,
                        -- NULL = eget lager i butikken
  source                text NOT NULL,
                        -- woo_order / pos_sale / manual / supplier_sync / reservation
  event_type            text NOT NULL,
                        -- sale / restock / adjustment / reservation / reservation_cancel
  quantity_delta        int NOT NULL,   -- negativ ved salg, positiv ved genopfyldning
  new_quantity          int,            -- beholdning EFTER hændelsen
  order_reference       text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_events_product_id ON inventory_events(product_id);
CREATE INDEX idx_inventory_events_created_at ON inventory_events(created_at DESC);

-- ============================================================
-- VIEW: available_stock
-- Beregner total tilgængeligt lager pr. produkt
-- (eget lager + leverandørlager, fratrukket reservationer)
-- ============================================================
CREATE VIEW available_stock AS
SELECT
  p.id                                              AS product_id,
  p.internal_sku,
  p.name,
  -- Eget lager netto
  (p.own_stock_quantity - p.own_stock_reserved)     AS own_stock_available,
  -- Leverandørlager netto (kun aktive leverandører)
  COALESCE((
    SELECT SUM(ps.supplier_stock_quantity - ps.supplier_stock_reserved)
    FROM product_suppliers ps
    WHERE ps.product_id = p.id
      AND ps.variant_id IS NULL
      AND ps.is_active = true
  ), 0)                                             AS supplier_stock_available,
  -- Total tilgængeligt
  (p.own_stock_quantity - p.own_stock_reserved) +
  COALESCE((
    SELECT SUM(ps.supplier_stock_quantity - ps.supplier_stock_reserved)
    FROM product_suppliers ps
    WHERE ps.product_id = p.id
      AND ps.variant_id IS NULL
      AND ps.is_active = true
  ), 0)                                             AS total_available
FROM products p;

-- ============================================================
-- UPDATED_AT triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER product_suppliers_updated_at
  BEFORE UPDATE ON product_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
