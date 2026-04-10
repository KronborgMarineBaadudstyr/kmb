// ============================================================
// Kronborg Marine Bådudstyr — Delte TypeScript typer
// ============================================================

// --- Database row typer ---

export type Manufacturer = {
  id: string
  name: string
  country: string | null
  website: string | null
  created_at: string
}

export type Product = {
  id: string
  internal_sku: string
  name: string
  description: string | null
  short_description: string | null
  manufacturer_id: string | null
  manufacturer_sku: string | null
  own_stock_quantity: number
  own_stock_reserved: number
  sales_price: number | null
  sale_price: number | null
  tax_class: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  specifications: Record<string, unknown> | null
  ean: string | null
  video_url: string | null
  categories: string[]
  tags: string[]
  attributes: ProductAttribute[]
  brand: string | null
  slug: string | null
  meta_title: string | null
  meta_description: string | null
  woo_product_id: number | null
  pos_product_id: string | null
  woo_bestillingsnummer: string | null
  status: 'draft' | 'validated' | 'published'
  woo_sync_status: 'synced' | 'pending' | 'error' | null
  created_at: string
  updated_at: string
  last_synced_woo_at: string | null
  last_synced_pos_at: string | null
}

export type ProductAttribute = {
  name: string
  value: string | string[]
}

export type ProductVariant = {
  id: string
  product_id: string
  internal_variant_sku: string
  attributes: ProductAttribute[]
  own_stock_quantity: number
  own_stock_reserved: number
  sales_price: number | null
  sale_price: number | null
  ean: string | null
  weight: number | null
  woo_variation_id: number | null
  status: 'active' | 'discontinued'
  created_at: string
  updated_at: string
}

export type Supplier = {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  data_format: 'excel' | 'api' | 'ftp' | 'manual' | null
  ftp_host: string | null
  ftp_port: number
  ftp_user: string | null
  ftp_password: string | null
  ftp_path: string | null
  ftp_protocol: 'ftp' | 'sftp' | 'ftps'
  api_url: string | null
  api_key: string | null
  api_format: 'json' | 'xml' | 'csv' | null
  api_auth_type: 'bearer' | 'basic' | 'oauth' | null
  excel_column_mapping: Record<string, string> | null
  excel_sheet_name: string | null
  sync_interval_hours: number
  last_synced_at: string | null
  active: boolean
  notes: string | null
  created_at: string
}

export type ProductSupplier = {
  id: string
  product_id: string
  variant_id: string | null
  supplier_id: string
  priority: number
  is_active: boolean
  supplier_sku: string
  supplier_product_name: string | null
  purchase_price: number | null
  recommended_sales_price: number | null
  previous_purchase_price: number | null
  delivery_days_min: number | null
  delivery_days_max: number | null
  moq: number
  supplier_stock_quantity: number
  supplier_stock_reserved: number
  supplier_stock_updated_at: string | null
  item_status: 'active' | 'new' | 'price_changed' | 'discontinued' | 'out_of_stock'
  item_status_changed_at: string | null
  supplier_images: SupplierImage[] | null
  supplier_files: SupplierFile[] | null
  extra_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type SupplierImage = {
  url: string
  alt: string
  is_primary: boolean
}

export type SupplierFile = {
  url: string
  name: string
  type: 'manual' | 'spec' | 'other'
}

export type ProductImage = {
  id: string
  product_id: string
  variant_id: string | null
  storage_path: string | null
  url: string
  alt_text: string | null
  position: number
  is_primary: boolean
  source: 'manual' | 'supplier' | 'woo'
  created_at: string
}

export type ProductFile = {
  id: string
  product_id: string
  storage_path: string | null
  url: string
  file_name: string
  file_type: 'manual' | 'spec' | 'certificate' | 'other'
  language: string
  position: number
  source: 'manual' | 'supplier' | 'woo'
  created_at: string
}

export type Order = {
  id: string
  woo_order_id: number
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded'
  fulfillment_status: 'unrouted' | 'routed' | 'approved' | 'dispatched' | 'delivered'
  customer_info: OrderCustomerInfo | null
  line_items: OrderLineItem[]
  shipping_method: string | null
  shipping_total: number | null
  order_total: number | null
  currency: string
  woo_created_at: string | null
  created_at: string
  updated_at: string
}

export type OrderCustomerInfo = {
  first_name: string
  last_name: string
  email: string
  billing: WooAddress
  shipping: WooAddress
}

export type OrderLineItem = {
  product_id: string | null        // vores interne ID
  variant_id: string | null        // vores interne variant ID
  woo_product_id: number
  woo_variation_id: number | null
  sku: string
  name: string
  quantity: number
  price: number
  total: number
}

export type WooAddress = {
  first_name: string
  last_name: string
  company: string
  address_1: string
  address_2: string
  city: string
  postcode: string
  country: string
  state: string
  phone: string
  email?: string
}

export type FulfillmentRoute = {
  id: string
  order_id: string
  route_status: 'suggested' | 'approved' | 'sent'
  shipments: Shipment[]
  optimization_notes: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export type Shipment = {
  source: 'own_stock' | string   // 'own_stock' eller supplier UUID
  supplier_name?: string
  items: ShipmentItem[]
}

export type ShipmentItem = {
  product_id: string
  variant_id: string | null
  name: string
  quantity: number
}

export type SupplierImport = {
  id: string
  supplier_id: string
  import_type: 'excel' | 'api' | 'ftp' | 'manual'
  file_name: string | null
  status: 'running' | 'completed' | 'failed'
  records_total: number
  records_created: number
  records_updated: number
  records_failed: number
  new_items: number
  price_changes: number
  discontinued_items: number
  error_log: unknown[] | null
  created_at: string
  completed_at: string | null
}

export type SyncLog = {
  id: string
  product_id: string | null
  variant_id: string | null
  target: 'woo' | 'pos'
  action: 'create' | 'update' | 'delete' | 'stock_update'
  status: 'success' | 'failed' | 'pending'
  payload: unknown
  response: unknown
  created_at: string
}

export type InventoryEvent = {
  id: string
  product_id: string | null
  variant_id: string | null
  product_supplier_id: string | null
  source: 'woo_order' | 'pos_sale' | 'manual' | 'supplier_sync' | 'reservation'
  event_type: 'sale' | 'restock' | 'adjustment' | 'reservation' | 'reservation_cancel'
  quantity_delta: number
  new_quantity: number | null
  order_reference: string | null
  notes: string | null
  created_at: string
}

// --- WooCommerce API typer ---

export type WooProduct = {
  id: number
  name: string
  slug: string
  description: string
  short_description: string
  type: 'simple' | 'variable' | 'grouped' | 'external'
  status: 'publish' | 'draft' | 'private'
  sku: string
  price: string
  regular_price: string
  sale_price: string
  manage_stock: boolean
  stock_quantity: number | null
  stock_status: 'instock' | 'outofstock' | 'onbackorder'
  categories: { id: number; name: string; slug: string }[]
  tags: { id: number; name: string; slug: string }[]
  images: { id: number; src: string; name: string; alt: string }[]
  attributes: {
    id: number
    name: string
    slug: string
    visible: boolean
    variation: boolean
    options: string[]
  }[]
  variations: number[]
  meta_data: { id: number; key: string; value: unknown }[]
  brands: { id: number; name: string; slug: string }[]
  weight: string
  dimensions: { length: string; width: string; height: string }
  date_created: string
  date_modified: string
}

export type WooVariation = {
  id: number
  sku: string
  price: string
  regular_price: string
  sale_price: string
  manage_stock: boolean
  stock_quantity: number | null
  attributes: { id: number; name: string; slug: string; option: string }[]
  meta_data: { id: number; key: string; value: unknown }[]
}

export type WooOrder = {
  id: number
  number: string
  status: string
  currency: string
  date_created: string
  total: string
  billing: WooAddress & { email: string }
  shipping: WooAddress
  line_items: {
    id: number
    name: string
    product_id: number
    variation_id: number
    quantity: number
    sku: string
    price: number
    total: string
  }[]
  shipping_lines: {
    id: number
    method_title: string
    method_id: string
    total: string
  }[]
  meta_data: { id: number; key: string; value: unknown }[]
}

// --- API respons-typer ---

export type ApiResponse<T> = {
  data: T
  error: null
} | {
  data: null
  error: string
}

export type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
