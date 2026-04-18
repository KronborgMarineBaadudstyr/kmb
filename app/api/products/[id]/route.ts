import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Hent produkt med billeder, filer og varianter
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      manufacturers ( id, name, country, website ),
      product_images ( id, url, alt_text, is_primary, position, source, storage_path ),
      product_files  ( id, url, file_name, file_type, language, position, source ),
      product_variants (
        id, internal_variant_sku, attributes, own_stock_quantity,
        own_stock_reserved, sales_price, sale_price, ean, woo_variation_id, status
      ),
      product_suppliers (
        id, priority, is_active, supplier_sku, supplier_product_name,
        purchase_price, recommended_sales_price, delivery_days_min, delivery_days_max,
        moq, supplier_stock_quantity, supplier_stock_reserved, item_status,
        supplier_images, supplier_files, extra_data, updated_at,
        suppliers ( id, name, contact_email, data_format )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !product) {
    return NextResponse.json({ error: 'Produkt ikke fundet' }, { status: 404 })
  }

  // Sortér billeder og varianter
  const sorted = {
    ...product,
    product_images:   [...(product.product_images ?? [])].sort((a, b) => a.position - b.position),
    product_files:    [...(product.product_files   ?? [])].sort((a, b) => a.position - b.position),
    product_variants: [...(product.product_variants ?? [])].sort((a, b) =>
      a.internal_variant_sku.localeCompare(b.internal_variant_sku)),
    product_suppliers: [...(product.product_suppliers ?? [])].sort((a, b) => a.priority - b.priority),
  }

  return NextResponse.json({ data: sorted })
}

const ALLOWED_FIELDS = [
  'name', 'description', 'short_description', 'sales_price', 'sale_price',
  'tax_class', 'ean', 'manufacturer_sku', 'brand', 'slug', 'weight',
  'length', 'width', 'height', 'categories', 'tags', 'attributes',
  'specifications', 'video_url', 'meta_title', 'meta_description', 'status',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field]
    }
  }

  const { data: updatedProduct, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updatedProduct })
}
