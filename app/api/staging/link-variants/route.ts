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
//
// Creates 1 parent product + N product_variants rows (one per staging row),
// creates product_suppliers on the PARENT with variant_id set,
// marks staging rows as matched.
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

  // Pick the staging row with the most complete raw_data to fill parent-level fields
  function completenessScore(raw: Record<string, unknown>): number {
    return ['description','short_description','brand','weight','supplier_images'].reduce((n, f) => {
      const v = raw[f]; if (!v) return n
      if (typeof v === 'string' && v.trim()) return n + 1
      if (typeof v === 'number') return n + 1
      if (Array.isArray(v) && v.length > 0) return n + 1
      return n
    }, 0)
  }
  const primaryStaging = [...stagingRows].sort((a, b) =>
    completenessScore(b.raw_data as Record<string, unknown>) - completenessScore(a.raw_data as Record<string, unknown>)
  )[0]
  const primaryRaw = (primaryStaging?.raw_data ?? {}) as Record<string, unknown>

  // 3. Create parent product
  const { data: parentProduct, error: ppErr } = await supabase
    .from('products')
    .insert({
      internal_sku:      generateSku(),
      name:              parent_name.trim(),
      status:            'draft',
      categories,
      boat_type:         boatType,
      description:       typeof primaryRaw.description      === 'string' ? primaryRaw.description      : null,
      short_description: typeof primaryRaw.short_description === 'string' ? primaryRaw.short_description : null,
      brand:             typeof primaryRaw.brand             === 'string' ? primaryRaw.brand             : null,
      weight:            typeof primaryRaw.weight === 'number' && isFinite(primaryRaw.weight as number) ? primaryRaw.weight : null,
    })
    .select('id')
    .single()

  if (ppErr || !parentProduct) {
    return NextResponse.json({ error: ppErr?.message ?? 'Kunne ikke oprette overprodukt' }, { status: 500 })
  }

  const parentId = parentProduct.id

  // 4. Create product_variants rows — one per staging row
  //    attributes: [{name: key, value: val}, ...]
  const variantInserts = variants.map(v => {
    const staging = stagingRows.find(r => r.id === v.staging_id)
    const raw     = (staging?.raw_data ?? {}) as Record<string, unknown>
    const attrs   = Object.entries(v.variant_attrs ?? {}).map(([name, value]) => ({ name, value }))
    return {
      product_id:           parentId,
      internal_variant_sku: generateSku(),
      attributes:           attrs,
      ean:                  staging?.normalized_ean ?? null,
      sales_price:          typeof raw.recommended_sales_price === 'number' && isFinite(raw.recommended_sales_price as number)
                              ? raw.recommended_sales_price : null,
      own_stock_quantity:   0,
      own_stock_reserved:   0,
      status:               'active',
    }
  })

  const { data: createdVariants, error: cvErr } = await supabase
    .from('product_variants')
    .insert(variantInserts)
    .select('id, internal_variant_sku')

  if (cvErr || !createdVariants?.length) {
    // Rollback parent
    await supabase.from('products').delete().eq('id', parentId)
    return NextResponse.json({ error: cvErr?.message ?? 'Kunne ikke oprette varianter' }, { status: 500 })
  }

  // Map staging_id → variant id via position (same order as insert)
  const stagingToVariantId = new Map<string, string>()
  for (let i = 0; i < variantInserts.length; i++) {
    const variantId = (createdVariants as { id: string; internal_variant_sku: string }[])
      .find(cv => cv.internal_variant_sku === variantInserts[i].internal_variant_sku)?.id
    if (variantId) stagingToVariantId.set(variants[i].staging_id, variantId)
  }

  // 5. Create product_suppliers on the PARENT with variant_id set
  const supplierInserts = stagingRows.map(s => {
    const raw       = (s.raw_data ?? {}) as Record<string, unknown>
    const variantId = stagingToVariantId.get(s.id)
    return {
      product_id:              parentId,
      variant_id:              variantId ?? null,
      supplier_id:             s.supplier_id,
      supplier_sku:            s.normalized_sku,
      supplier_product_name:   typeof raw.supplier_product_name === 'string' ? raw.supplier_product_name : s.normalized_name,
      purchase_price:          typeof raw.purchase_price === 'number' && isFinite(raw.purchase_price as number) ? raw.purchase_price : null,
      recommended_sales_price: typeof raw.recommended_sales_price === 'number' && isFinite(raw.recommended_sales_price as number) ? raw.recommended_sales_price : null,
      supplier_stock_quantity: typeof raw.supplier_stock_quantity === 'number' ? Math.max(0, Math.round(raw.supplier_stock_quantity as number)) : 0,
      supplier_stock_reserved: 0,
      supplier_images: Array.isArray(raw.supplier_images) ? raw.supplier_images : [],
      supplier_files:  Array.isArray(raw.supplier_files)  ? raw.supplier_files  : [],
      priority:    1,
      item_status: 'active',
      is_active:   true,
    }
  })

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
    ok:               true,
    parent_id:        parentId,
    parent_name:      parent_name.trim(),
    variants_created: createdVariants.length,
  })
}
