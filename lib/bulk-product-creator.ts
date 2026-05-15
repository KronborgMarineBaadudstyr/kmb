import type { SupabaseClient } from '@supabase/supabase-js'

type RawData = Record<string, unknown>

type ProductType = {
  id:              string
  keywords:        string[] | null
  our_category:    string | null
  our_subcategory: string | null
}

function findProductType(name: string, types: ProductType[]): ProductType | null {
  const lower = name.toLowerCase()
  for (const pt of types) {
    const keywords = pt.keywords ?? []
    if (keywords.some(kw => kw && lower.includes(kw.toLowerCase()))) return pt
  }
  return null
}

type StagingRow = {
  id:             string
  match_group_id: string
  supplier_id:    string
  normalized_name: string
  normalized_ean:  string | null
  normalized_sku:  string
  raw_data:        RawData
}

type GroupRow = {
  id:             string
  suggested_name: string | null
  suggested_ean:  string | null
}

type PreparedProduct = {
  groupId:    string
  members:    StagingRow[]
  dbRow: {
    internal_sku:      string
    name:              string
    ean:               string | null
    status:            string
    description:       string | null
    short_description: string | null
    brand:             string | null
    weight:            number | null
    length:            number | null
    width:             number | null
    height:            number | null
    categories:        string[]
  }
}

// Safe numeric helpers — guard against supplier data that overflows DB columns
const MAX_PRICE = 9_999_999.99   // NUMERIC(10,2) typical
const MAX_DIM   = 99_999.999     // NUMERIC(10,3) for weight/dimensions

function safePrice(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) return null
  return v > MAX_PRICE ? MAX_PRICE : v
}

function safeDim(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) return null
  return v > MAX_DIM ? MAX_DIM : v
}

function safeQty(v: unknown): number {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) return 0
  return Math.min(Math.round(v), 2_147_483_647) // INT4 max
}

function generateSku(idx: number): string {
  const ts   = Date.now().toString(36).toUpperCase()
  const hex  = idx.toString(16).toUpperCase().padStart(4, '0')
  return `KMB-${ts}-${hex}`
}

function completenessScore(raw: RawData): number {
  const fields = ['description', 'short_description', 'purchase_price', 'recommended_sales_price',
    'supplier_images', 'supplier_files', 'brand', 'weight', 'length', 'width', 'height']
  let score = 0
  for (const f of fields) {
    const v = raw[f]
    if (v == null) continue
    if (typeof v === 'string' && v.trim()) score++
    else if (typeof v === 'number') score++
    else if (Array.isArray(v) && v.length > 0) score++
    else if (v && typeof v === 'object') score++
  }
  return score
}

// Bulk-create products for up to `limit` confirmed groups without a product.
// Uses 6 total DB round-trips regardless of how many products are created.
export async function bulkCreateProductsFromGroups(
  supabase: SupabaseClient,
  limit = 2000,
): Promise<{ created: number; skipped: number; remaining: number }> {

  // 0. Load product types for category matching
  const { data: ptData } = await supabase
    .from('product_types')
    .select('id, keywords, our_category, our_subcategory')
  const productTypes = (ptData ?? []) as ProductType[]

  // 1. Load confirmed groups
  const { data: groupData, error: gErr } = await supabase
    .from('staging_match_groups')
    .select('id, suggested_name, suggested_ean')
    .eq('status', 'confirmed')
    .is('product_id', null)
    .limit(limit)

  if (gErr) throw new Error(`Gruppe-hentning fejlede: ${gErr.message}`)
  const groups = (groupData ?? []) as GroupRow[]
  if (groups.length === 0) return { created: 0, skipped: 0, remaining: 0 }

  const groupIds = groups.map(g => g.id)

  // 2. Load all staging members in batches
  const allMembers: StagingRow[] = []
  for (let i = 0; i < groupIds.length; i += 500) {
    const { data, error } = await supabase
      .from('supplier_product_staging')
      .select('id, match_group_id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
      .in('match_group_id', groupIds.slice(i, i + 500))
    if (error) throw new Error(`Member-hentning fejlede: ${error.message}`)
    allMembers.push(...((data ?? []) as StagingRow[]))
  }

  const membersByGroup = new Map<string, StagingRow[]>()
  for (const m of allMembers) {
    if (!membersByGroup.has(m.match_group_id)) membersByGroup.set(m.match_group_id, [])
    membersByGroup.get(m.match_group_id)!.push(m)
  }

  // 3. Prepare product rows
  const prepared: PreparedProduct[] = []
  const skipped: string[] = []

  for (let idx = 0; idx < groups.length; idx++) {
    const group   = groups[idx]
    const members = membersByGroup.get(group.id) ?? []
    if (members.length === 0) { skipped.push(group.id); continue }

    const name = group.suggested_name?.trim() ||
      [...members].sort((a, b) => (b.normalized_name?.length ?? 0) - (a.normalized_name?.length ?? 0))[0]
        ?.normalized_name?.trim() || ''

    if (!name) { skipped.push(group.id); continue }

    const primary = [...members].sort((a, b) => completenessScore(b.raw_data) - completenessScore(a.raw_data))[0]
    const raw     = primary.raw_data

    const matchedType = findProductType(name, productTypes)
    const categories: string[] = matchedType
      ? [matchedType.our_category, matchedType.our_subcategory].filter((c): c is string => !!c)
      : (Array.isArray(raw.categories) ? (raw.categories as string[]) : [])

    prepared.push({
      groupId: group.id,
      members,
      dbRow: {
        internal_sku:      generateSku(idx),
        name,
        ean:               group.suggested_ean ?? primary.normalized_ean ?? null,
        status:            'draft',
        description:       typeof raw.description       === 'string' ? raw.description       : null,
        short_description: typeof raw.short_description === 'string' ? raw.short_description : null,
        brand:             typeof raw.brand             === 'string' ? raw.brand             : null,
        weight:            safeDim(raw.weight),
        length:            safeDim(raw.length),
        width:             safeDim(raw.width),
        height:            safeDim(raw.height),
        categories,
      },
    })
  }

  if (prepared.length === 0) return { created: 0, skipped: skipped.length, remaining: 0 }

  // 4. Bulk insert products
  const { data: insertedProducts, error: pErr } = await supabase
    .from('products')
    .insert(prepared.map(p => p.dbRow))
    .select('id, internal_sku')

  if (pErr) throw new Error(`Produkt bulk-insert fejlede: ${pErr.message}`)

  const skuToId = new Map<string, string>()
  for (const p of (insertedProducts ?? []) as { id: string; internal_sku: string }[]) {
    skuToId.set(p.internal_sku, p.id)
  }

  // 5. Build and bulk-insert product_suppliers
  const groupIdToProductId = new Map<string, string>()
  const supplierInserts: Record<string, unknown>[] = []
  const allStagingIds: string[] = []

  for (const p of prepared) {
    const productId = skuToId.get(p.dbRow.internal_sku)
    if (!productId) continue
    groupIdToProductId.set(p.groupId, productId)

    const ordered = [...p.members].sort((a, b) => {
      if (!!a.normalized_ean !== !!b.normalized_ean) return a.normalized_ean ? -1 : 1
      const aPrice = typeof a.raw_data.purchase_price === 'number' ? a.raw_data.purchase_price : Infinity
      const bPrice = typeof b.raw_data.purchase_price === 'number' ? b.raw_data.purchase_price : Infinity
      return aPrice - bPrice
    })

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i]
      allStagingIds.push(m.id)
      supplierInserts.push({
        product_id:              productId,
        supplier_id:             m.supplier_id,
        supplier_sku:            m.normalized_sku,
        supplier_product_name:   typeof m.raw_data.supplier_product_name === 'string'
                                   ? m.raw_data.supplier_product_name : m.normalized_name,
        purchase_price:          safePrice(m.raw_data.purchase_price),
        recommended_sales_price: safePrice(m.raw_data.recommended_sales_price),
        supplier_stock_quantity: safeQty(m.raw_data.supplier_stock_quantity),
        supplier_stock_reserved: 0,
        supplier_images: Array.isArray(m.raw_data.supplier_images) ? m.raw_data.supplier_images : [],
        supplier_files:  Array.isArray(m.raw_data.supplier_files)  ? m.raw_data.supplier_files  : [],
        priority:    i + 1,
        item_status: 'active',
        is_active:   true,
      })
    }
  }

  for (let i = 0; i < supplierInserts.length; i += 500) {
    const { error } = await supabase.from('product_suppliers').insert(supplierInserts.slice(i, i + 500))
    if (error) console.error('[bulk-creator] product_suppliers error:', error.message)
  }

  // 6. Bulk update staging → matched
  const now = new Date().toISOString()
  for (let i = 0; i < allStagingIds.length; i += 500) {
    await supabase
      .from('supplier_product_staging')
      .update({ status: 'matched', updated_at: now })
      .in('id', allStagingIds.slice(i, i + 500))
  }

  // 7. Update groups → product_created (batch by 100 individual updates)
  const groupUpdates = Array.from(groupIdToProductId.entries())
  for (let i = 0; i < groupUpdates.length; i += 100) {
    await Promise.all(
      groupUpdates.slice(i, i + 100).map(([groupId, productId]) =>
        supabase.from('staging_match_groups')
          .update({ status: 'product_created', product_id: productId, updated_at: now })
          .eq('id', groupId)
      )
    )
  }

  // 8. Count remaining
  const { count: remaining } = await supabase
    .from('staging_match_groups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .is('product_id', null)

  return { created: prepared.length, skipped: skipped.length, remaining: remaining ?? 0 }
}
