import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { assignProductCategory } from '@/lib/standard-categories'

export const dynamic = 'force-dynamic'

function generateSku(): string {
  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `KMB-${ts}-${rnd}`
}

// POST /api/staging/link-variants
// Body: {
//   parent_name: string,
//   variants: Array<{ staging_id: string, variant_attrs: Record<string, string> }>
// }
// Creates 1 parent product + N variant products (one per staging row),
// links them with parent_product_id, creates product_suppliers, marks staging as matched.
export async function POST(request: Request) {
  const supabase = createServiceClient()

  let body: { parent_name: string; variants: Array<{ staging_id: string; variant_attrs: Record<string, string> }> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const { parent_name, variants } = body
  if (!parent_name?.trim()) return NextResponse.json({ error: 'parent_name mangler' }, { status: 400 })
  if (!variants?.length)    return NextResponse.json({ error: 'variants mangler' },    { status: 400 })

  // 1. Load all staging rows
  const stagingIds = variants.map(v => v.staging_id)
  const { data: stagingRows, error: sErr } = await supabase
    .from('supplier_product_staging')
    .select('id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
    .in('id', stagingIds)

  if (sErr || !stagingRows?.length) {
    return NextResponse.json({ error: sErr?.message ?? 'Staging-rækker ikke fundet' }, { status: 404 })
  }

  // 2. Determine category from parent name
  const assigned = assignProductCategory(parent_name.trim())
  const categories: string[] = assigned.category
    ? [assigned.category, assigned.subcategory].filter((c): c is string => !!c)
    : []
  const boatType: string[] = assigned.boatType

  // 3. Create parent product (no supplier, just a container)
  const { data: parentProduct, error: ppErr } = await supabase
    .from('products')
    .insert({
      internal_sku:  generateSku(),
      name:          parent_name.trim(),
      status:        'draft',
      categories,
      boat_type:     boatType,
      variant_attributes: {},
    })
    .select('id')
    .single()

  if (ppErr || !parentProduct) {
    return NextResponse.json({ error: ppErr?.message ?? 'Kunne ikke oprette overprodukt' }, { status: 500 })
  }

  const parentId = parentProduct.id

  // 4. Create one variant product per staging row
  const variantRows = variants.map(v => {
    const staging = stagingRows.find(r => r.id === v.staging_id)
    const raw     = (staging?.raw_data ?? {}) as Record<string, unknown>
    return {
      internal_sku:       generateSku(),
      name:               parent_name.trim(),
      parent_product_id:  parentId,
      variant_attributes: v.variant_attrs ?? {},
      status:             'draft',
      categories,
      boat_type:          boatType,
      description:        typeof raw.description === 'string' ? raw.description : null,
      short_description:  typeof raw.short_description === 'string' ? raw.short_description : null,
      brand:              typeof raw.brand === 'string' ? raw.brand : null,
      weight:             typeof raw.weight === 'number' && isFinite(raw.weight) ? raw.weight : null,
      ean:                staging?.normalized_ean ?? null,
    }
  })

  const { data: createdVariants, error: cvErr } = await supabase
    .from('products')
    .insert(variantRows)
    .select('id, internal_sku')

  if (cvErr || !createdVariants?.length) {
    // Rollback parent
    await supabase.from('products').delete().eq('id', parentId)
    return NextResponse.json({ error: cvErr?.message ?? 'Kunne ikke oprette varianter' }, { status: 500 })
  }

  // Map staging_id → variant product_id via position (same order as insert)
  const skuToId = new Map<string, string>()
  for (const v of createdVariants as { id: string; internal_sku: string }[]) {
    skuToId.set(v.internal_sku, v.id)
  }
  // variantRows[i].internal_sku → createdVariants[i]
  const stagingToProductId = new Map<string, string>()
  for (let i = 0; i < variantRows.length; i++) {
    const productId = skuToId.get(variantRows[i].internal_sku)
    if (productId) stagingToProductId.set(variants[i].staging_id, productId)
  }

  // 5. Create product_suppliers for each variant
  const supplierInserts = stagingRows.map(s => {
    const productId = stagingToProductId.get(s.id)
    const raw = (s.raw_data ?? {}) as Record<string, unknown>
    return {
      product_id:              productId,
      supplier_id:             s.supplier_id,
      supplier_sku:            s.normalized_sku,
      supplier_product_name:   typeof raw.supplier_product_name === 'string' ? raw.supplier_product_name : s.normalized_name,
      purchase_price:          typeof raw.purchase_price === 'number' && isFinite(raw.purchase_price) ? raw.purchase_price : null,
      recommended_sales_price: typeof raw.recommended_sales_price === 'number' && isFinite(raw.recommended_sales_price) ? raw.recommended_sales_price : null,
      supplier_stock_quantity: typeof raw.supplier_stock_quantity === 'number' ? Math.max(0, Math.round(raw.supplier_stock_quantity)) : 0,
      supplier_stock_reserved: 0,
      supplier_images: Array.isArray(raw.supplier_images) ? raw.supplier_images : [],
      supplier_files:  Array.isArray(raw.supplier_files)  ? raw.supplier_files  : [],
      priority:    1,
      item_status: 'active',
      is_active:   true,
    }
  }).filter(r => r.product_id)

  if (supplierInserts.length > 0) {
    await supabase.from('product_suppliers').insert(supplierInserts)
  }

  // 6. Mark staging rows as matched
  const now = new Date().toISOString()
  await supabase
    .from('supplier_product_staging')
    .update({ status: 'matched', updated_at: now })
    .in('id', stagingIds)

  return NextResponse.json({
    ok: true,
    parent_id:   parentId,
    parent_name: parent_name.trim(),
    variants_created: createdVariants.length,
  })
}
