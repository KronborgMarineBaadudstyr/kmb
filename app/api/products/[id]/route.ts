import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(); if (denied) return denied
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
        own_stock_reserved, sales_price, sale_price, ean, status,
        variant_barcodes ( id, ean, is_primary, note, created_at )
      ),
      product_suppliers (
        id, priority, is_active, variant_id, supplier_sku, manufacturer_sku,
        supplier_product_name,
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

  // Build a map: variant_id → supplier info (from product_suppliers with variant_id set)
  type SupplierRow = {
    variant_id: string | null; supplier_sku: string; supplier_product_name: string | null
    purchase_price: number | null; supplier_stock_quantity: number
    supplier_images: unknown
    suppliers: { name: string }
  }
  const supplierByVariant = new Map<string, {
    name: string; supplier_sku: string; supplier_product_name: string | null
    purchase_price: number | null; supplier_stock_quantity: number
    image_url: string | null
  }>()
  for (const ps of (product.product_suppliers ?? []) as SupplierRow[]) {
    if (ps.variant_id) {
      const imgs = Array.isArray(ps.supplier_images) ? ps.supplier_images as { url: string }[] : []
      supplierByVariant.set(ps.variant_id, {
        name: ps.suppliers.name,
        supplier_sku: ps.supplier_sku,
        supplier_product_name: ps.supplier_product_name,
        purchase_price: ps.purchase_price,
        supplier_stock_quantity: ps.supplier_stock_quantity,
        image_url: imgs[0]?.url ?? null,
      })
    }
  }

  // Enrich product_variants with their linked supplier
  const enrichedVariants = [...(product.product_variants ?? [])]
    .sort((a, b) => a.internal_variant_sku.localeCompare(b.internal_variant_sku))
    .map(v => ({
      ...v,
      supplier: supplierByVariant.get(v.id) ?? null,
    }))

  let variantParent: { id: string; name: string } | null = null
  if (product.variant_of_product_id) {
    const { data: parent } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', product.variant_of_product_id)
      .single()
    variantParent = parent ?? null
  }

  const sorted = {
    ...product,
    variant_parent: variantParent,
    product_images:    [...(product.product_images ?? [])].sort((a, b) => a.position - b.position),
    product_files:     [...(product.product_files   ?? [])].sort((a, b) => a.position - b.position),
    product_variants:  enrichedVariants,
    product_suppliers: [...(product.product_suppliers ?? [])].sort((a, b) => a.priority - b.priority),
  }

  return NextResponse.json({ data: sorted })
}

const ALLOWED_FIELDS = [
  'name', 'description', 'short_description', 'sales_price', 'sale_price',
  'tax_class', 'ean', 'manufacturer_sku', 'brand', 'slug', 'weight',
  'length', 'width', 'height', 'categories', 'tags', 'attributes',
  'specifications', 'video_url', 'meta_title', 'meta_description', 'status',
  'boat_type', 'hide_when_out_of_stock',
  'original_number', 'original_number_source',
  'own_stock_quantity', 'own_stock_reserved',
  'variant_of_product_id',
  'expected_lifespan_months', 'lifespan_note',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  // Valider variant_of_product_id:
  // 1. Produktet må ikke pege på sig selv
  // 2. Et produkt der HAR children (andre peger på det) kan ikke selv blive variant
  // 3. Et produkt kan kun have ét parent (overskriver evt. eksisterende)
  if (Object.prototype.hasOwnProperty.call(body, 'variant_of_product_id') && body.variant_of_product_id) {
    const parentId = body.variant_of_product_id as string

    if (parentId === id) {
      return NextResponse.json({ error: 'Et produkt kan ikke være variant af sig selv' }, { status: 400 })
    }

    // Tjek at dette produkt ikke selv er parent for andre
    const { count: childCount } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('variant_of_product_id', id)

    if ((childCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Dette produkt er overprodukt for andre varianter og kan ikke selv blive en variant' },
        { status: 400 }
      )
    }

    // Tjek at parent ikke selv er variant af noget andet (ingen dybe kæder)
    const { data: parentRow } = await supabase
      .from('products')
      .select('variant_of_product_id')
      .eq('id', parentId)
      .single()

    if (parentRow?.variant_of_product_id) {
      return NextResponse.json(
        { error: 'Overprodukt er selv en variant — dybe kæder er ikke tilladt' },
        { status: 400 }
      )
    }
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
