import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractVariantValues, type ProductType, type VariantAttribute } from '@/lib/variant-detector'

export type { ProductType, VariantAttribute }

type RawData = Record<string, unknown>

type StagingMember = {
  id:              string
  supplier_id:     string
  normalized_name: string
  normalized_ean:  string | null
  normalized_sku:  string
  raw_data:        RawData
}

type MatchGroup = {
  id:            string
  suggested_ean: string | null
  suggested_name: string | null
}

function generateInternalSku(): string {
  const ts     = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `KMB-${ts}-${random}`
}

// Count non-null/non-empty fields in raw_data to find "most complete" row
function completenessScore(raw: RawData): number {
  const fields = [
    'description', 'short_description', 'purchase_price', 'recommended_sales_price',
    'supplier_images', 'supplier_files', 'brand', 'weight', 'length', 'width', 'height',
    'categories', 'supplier_product_name',
  ]
  let score = 0
  for (const f of fields) {
    const v = raw[f]
    if (v == null) continue
    if (typeof v === 'string'  && v.trim() !== '') score++
    else if (typeof v === 'number') score++
    else if (Array.isArray(v) && v.length > 0) score++
    else if (typeof v === 'object') score++
  }
  return score
}

export async function createProductFromGroup(
  groupId:    string,
  chosenName: string,
  supabase?:  SupabaseClient,
): Promise<{ product_id: string }> {
  const db = supabase ?? createServiceClient()

  // 1. Load group
  const { data: group, error: gErr } = await db
    .from('staging_match_groups')
    .select('id, suggested_ean, suggested_name')
    .eq('id', groupId)
    .single()

  if (gErr || !group) throw new Error(`Gruppe ikke fundet: ${gErr?.message}`)

  const g = group as MatchGroup

  // 2. Load all staging members
  const { data: members, error: mErr } = await db
    .from('supplier_product_staging')
    .select('id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
    .eq('match_group_id', groupId)

  if (mErr) throw new Error(`Kunne ikke hente gruppe-members: ${mErr.message}`)
  if (!members || members.length === 0) throw new Error('Ingen staging-rækker i gruppen')

  const rows = members as StagingMember[]

  // 3. Find most-complete row for product fields
  const sorted = [...rows].sort((a, b) => completenessScore(b.raw_data) - completenessScore(a.raw_data))
  const primary = sorted[0]
  const raw     = primary.raw_data

  // 4. Generate internal SKU
  const internalSku = generateInternalSku()

  // 5. Create product
  const { data: product, error: pErr } = await db
    .from('products')
    .insert({
      internal_sku:      internalSku,
      name:              chosenName,
      ean:               g.suggested_ean ?? primary.normalized_ean ?? null,
      status:            'draft',
      description:       typeof raw.description       === 'string' ? raw.description       : null,
      short_description: typeof raw.short_description === 'string' ? raw.short_description : null,
      brand:             typeof raw.brand             === 'string' ? raw.brand             : null,
      weight:            typeof raw.weight            === 'number' ? raw.weight            : null,
      length:            typeof raw.length            === 'number' ? raw.length            : null,
      width:             typeof raw.width             === 'number' ? raw.width             : null,
      height:            typeof raw.height            === 'number' ? raw.height            : null,
      categories:        Array.isArray(raw.categories) ? raw.categories : [],
    })
    .select('id')
    .single()

  if (pErr || !product) throw new Error(`Produkt-oprettelse fejlede: ${pErr?.message}`)

  const productId = (product as { id: string }).id

  // 6. Create product_suppliers — EAN-matched rows first, then by purchase_price asc
  const orderedRows = [...rows].sort((a, b) => {
    // EAN-matched rows come first
    const aHasEan = !!a.normalized_ean
    const bHasEan = !!b.normalized_ean
    if (aHasEan !== bHasEan) return aHasEan ? -1 : 1

    // Then sort by purchase_price ascending (cheapest first = highest priority)
    const aPrice = typeof a.raw_data.purchase_price === 'number' ? a.raw_data.purchase_price : Infinity
    const bPrice = typeof b.raw_data.purchase_price === 'number' ? b.raw_data.purchase_price : Infinity
    return aPrice - bPrice
  })

  const supplierInserts = orderedRows.map((row, idx) => ({
    product_id:               productId,
    supplier_id:              row.supplier_id,
    supplier_sku:             row.normalized_sku,
    supplier_product_name:    typeof row.raw_data.supplier_product_name === 'string'
                                ? row.raw_data.supplier_product_name
                                : row.normalized_name,
    purchase_price:           typeof row.raw_data.purchase_price === 'number'
                                ? row.raw_data.purchase_price : null,
    recommended_sales_price:  typeof row.raw_data.recommended_sales_price === 'number'
                                ? row.raw_data.recommended_sales_price : null,
    supplier_stock_quantity:  typeof row.raw_data.supplier_stock_quantity === 'number'
                                ? row.raw_data.supplier_stock_quantity : 0,
    supplier_stock_reserved:  0,
    supplier_images:          Array.isArray(row.raw_data.supplier_images)
                                ? row.raw_data.supplier_images : [],
    supplier_files:           Array.isArray(row.raw_data.supplier_files)
                                ? row.raw_data.supplier_files : [],
    priority:                 idx + 1,
    item_status:              'active',
    is_active:                true,
  }))

  if (supplierInserts.length > 0) {
    const { error: psErr } = await db
      .from('product_suppliers')
      .insert(supplierInserts)

    if (psErr) throw new Error(`product_suppliers insert fejlede: ${psErr.message}`)
  }

  // 7. Update staging rows: status = 'matched', matched_product_id = product.id
  const stagingIds = rows.map(r => r.id)
  const { error: sErr } = await db
    .from('supplier_product_staging')
    .update({
      status:             'matched',
      matched_product_id: productId,
      updated_at:         new Date().toISOString(),
    })
    .in('id', stagingIds)

  if (sErr) throw new Error(`Staging-opdatering fejlede: ${sErr.message}`)

  // 8. Update group
  const { error: grpErr } = await db
    .from('staging_match_groups')
    .update({
      status:     'product_created',
      product_id: productId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', groupId)

  if (grpErr) throw new Error(`Gruppe-opdatering fejlede: ${grpErr.message}`)

  return { product_id: productId }
}

// ============================================================
// createProductFromGroupWithVariants
// Like createProductFromGroup but creates product_variants rows
// when the productType has variant_attributes defined.
// ============================================================
export async function createProductFromGroupWithVariants(
  groupId:         string,
  chosenBaseName:  string,
  productType:     ProductType | null,
  supabase?:       SupabaseClient,
): Promise<{ product_id: string }> {
  const db = supabase ?? createServiceClient()

  // Fall back to simple product if no variant attributes
  if (!productType || productType.variant_attributes.length === 0) {
    return createProductFromGroup(groupId, chosenBaseName, db)
  }

  // 1. Load group
  const { data: group, error: gErr } = await db
    .from('staging_match_groups')
    .select('id, suggested_ean, suggested_name')
    .eq('id', groupId)
    .single()

  if (gErr || !group) throw new Error(`Gruppe ikke fundet: ${gErr?.message}`)
  const g = group as MatchGroup

  // 2. Load all staging members
  const { data: members, error: mErr } = await db
    .from('supplier_product_staging')
    .select('id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
    .eq('match_group_id', groupId)

  if (mErr) throw new Error(`Kunne ikke hente gruppe-members: ${mErr.message}`)
  if (!members || members.length === 0) throw new Error('Ingen staging-rækker i gruppen')

  const rows = members as StagingMember[]

  // 3. Find most-complete row for product fields
  const sorted  = [...rows].sort((a, b) => completenessScore(b.raw_data) - completenessScore(a.raw_data))
  const primary = sorted[0]
  const raw     = primary.raw_data

  // 4. Generate internal SKU
  const internalSku = generateInternalSku()

  // 5. Determine categories
  const categories: string[] = productType.our_category
    ? [productType.our_category, ...(productType.our_subcategory ? [productType.our_subcategory] : [])]
    : (Array.isArray(raw.categories) ? (raw.categories as string[]) : [])

  // 6. Create product
  const { data: product, error: pErr } = await db
    .from('products')
    .insert({
      internal_sku:      internalSku,
      name:              chosenBaseName,
      ean:               g.suggested_ean ?? primary.normalized_ean ?? null,
      status:            'draft',
      description:       typeof raw.description       === 'string' ? raw.description       : null,
      short_description: typeof raw.short_description === 'string' ? raw.short_description : null,
      brand:             typeof raw.brand             === 'string' ? raw.brand             : null,
      weight:            typeof raw.weight            === 'number' ? raw.weight            : null,
      length:            typeof raw.length            === 'number' ? raw.length            : null,
      width:             typeof raw.width             === 'number' ? raw.width             : null,
      height:            typeof raw.height            === 'number' ? raw.height            : null,
      categories,
    })
    .select('id')
    .single()

  if (pErr || !product) throw new Error(`Produkt-oprettelse fejlede: ${pErr?.message}`)

  const productId = (product as { id: string }).id

  // 7. Extract variant values per staging member
  const variantAttrs = productType.variant_attributes

  type VariantKey = string  // JSON-serialised sorted attribute pairs
  const variantMap = new Map<VariantKey, { attributes: { name: string; value: string }[]; variantId?: string }>()

  // Build unique variant combinations
  for (const row of rows) {
    const values = extractVariantValues(row.normalized_name, variantAttrs)
    const attrPairs = variantAttrs
      .filter(a => values[a.name] !== undefined)
      .map(a => ({ name: a.name, value: values[a.name] }))

    if (attrPairs.length === 0) continue  // no variant detected — will be linked to product only

    const key = JSON.stringify(attrPairs)
    if (!variantMap.has(key)) variantMap.set(key, { attributes: attrPairs })
  }

  // 8. Insert product_variants
  if (variantMap.size > 0) {
    const variantInserts = Array.from(variantMap.entries()).map(([, v], idx) => ({
      product_id:           productId,
      internal_variant_sku: `${internalSku}-V${idx + 1}`,
      attributes:           v.attributes,
      status:               'active',
    }))

    const { data: insertedVariants, error: vErr } = await db
      .from('product_variants')
      .insert(variantInserts)
      .select('id, attributes')

    if (vErr) throw new Error(`product_variants insert fejlede: ${vErr.message}`)

    // Update variantMap with real IDs
    if (insertedVariants) {
      for (const inserted of insertedVariants as { id: string; attributes: { name: string; value: string }[] }[]) {
        const key = JSON.stringify(inserted.attributes)
        const entry = variantMap.get(key)
        if (entry) entry.variantId = inserted.id
      }
    }
  }

  // 9. Create product_suppliers with variant linking
  const orderedRows = [...rows].sort((a, b) => {
    const aHasEan = !!a.normalized_ean
    const bHasEan = !!b.normalized_ean
    if (aHasEan !== bHasEan) return aHasEan ? -1 : 1
    const aPrice = typeof a.raw_data.purchase_price === 'number' ? a.raw_data.purchase_price : Infinity
    const bPrice = typeof b.raw_data.purchase_price === 'number' ? b.raw_data.purchase_price : Infinity
    return aPrice - bPrice
  })

  const supplierInserts = orderedRows.map((row, idx) => {
    const values = extractVariantValues(row.normalized_name, variantAttrs)
    const attrPairs = variantAttrs
      .filter(a => values[a.name] !== undefined)
      .map(a => ({ name: a.name, value: values[a.name] }))
    const variantKey = attrPairs.length > 0 ? JSON.stringify(attrPairs) : null
    const variantId  = variantKey ? (variantMap.get(variantKey)?.variantId ?? null) : null

    return {
      product_id:               productId,
      variant_id:               variantId,
      supplier_id:              row.supplier_id,
      supplier_sku:             row.normalized_sku,
      supplier_product_name:    typeof row.raw_data.supplier_product_name === 'string'
                                  ? row.raw_data.supplier_product_name
                                  : row.normalized_name,
      purchase_price:           typeof row.raw_data.purchase_price === 'number'
                                  ? row.raw_data.purchase_price : null,
      recommended_sales_price:  typeof row.raw_data.recommended_sales_price === 'number'
                                  ? row.raw_data.recommended_sales_price : null,
      supplier_stock_quantity:  typeof row.raw_data.supplier_stock_quantity === 'number'
                                  ? row.raw_data.supplier_stock_quantity : 0,
      supplier_stock_reserved:  0,
      supplier_images:          Array.isArray(row.raw_data.supplier_images)
                                  ? row.raw_data.supplier_images : [],
      supplier_files:           Array.isArray(row.raw_data.supplier_files)
                                  ? row.raw_data.supplier_files : [],
      priority:                 idx + 1,
      item_status:              'active',
      is_active:                true,
    }
  })

  if (supplierInserts.length > 0) {
    const { error: psErr } = await db.from('product_suppliers').insert(supplierInserts)
    if (psErr) throw new Error(`product_suppliers insert fejlede: ${psErr.message}`)
  }

  // 10. Update staging rows
  const stagingIds = rows.map(r => r.id)
  const { error: sErr } = await db
    .from('supplier_product_staging')
    .update({ status: 'matched', matched_product_id: productId, updated_at: new Date().toISOString() })
    .in('id', stagingIds)

  if (sErr) throw new Error(`Staging-opdatering fejlede: ${sErr.message}`)

  // 11. Update group
  const { error: grpErr } = await db
    .from('staging_match_groups')
    .update({ status: 'product_created', product_id: productId, updated_at: new Date().toISOString() })
    .eq('id', groupId)

  if (grpErr) throw new Error(`Gruppe-opdatering fejlede: ${grpErr.message}`)

  return { product_id: productId }
}
