import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products?search=&status=&category=&supplier_id=&brand=&in_stock=1&min_price=&max_price=&page=1&per_page=50&sort=name&order=asc
export async function GET(request: Request) {
  const url        = new URL(request.url)
  const search     = url.searchParams.get('search')      || ''
  const status     = url.searchParams.get('status')      || ''
  const category   = url.searchParams.get('category')    || ''
  const supplierId = url.searchParams.get('supplier_id') || ''
  const brand      = url.searchParams.get('brand')       || ''
  const inStock    = url.searchParams.get('in_stock')    === '1'
  const minPrice   = url.searchParams.get('min_price')   || ''
  const maxPrice   = url.searchParams.get('max_price')   || ''
  // boat_type=sejlbåd|motorbåd (shoppen): skjul varer der kun er til den anden bådtype — varer uden bådtype vises altid
  const boatType   = url.searchParams.get('boat_type')   || ''
  // shop=1 → exclude archived + rejected + variant_of products automatically
  const shopMode = url.searchParams.get('shop') === '1'
  const page       = Math.max(1, parseInt(url.searchParams.get('page')     || '1',  10))
  const perPage    = Math.min(100, parseInt(url.searchParams.get('per_page') || '50', 10))
  const sort       = url.searchParams.get('sort')  || 'name'
  const order      = url.searchParams.get('order') === 'desc' ? false : true

  const supabase = createServiceClient()
  const from     = (page - 1) * perPage
  const to       = from + perPage - 1

  const allowedSortCols = ['name', 'internal_sku', 'sales_price', 'own_stock_quantity', 'created_at', 'updated_at']
  const sortCol = allowedSortCols.includes(sort) ? sort : 'name'

  // ── Supplier filter: resolve product IDs ─────────────────────────────────────
  let supplierProductIds: string[] | null = null
  if (supplierId) {
    const { data: spRows } = await supabase
      .from('product_suppliers')
      .select('product_id')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .not('product_id', 'is', null)

    supplierProductIds = [...new Set((spRows ?? []).map(r => r.product_id).filter(Boolean))]
    if (supplierProductIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, per_page: perPage, total_pages: 0 })
    }
  }

  // ── Cross-table search: collect extra product IDs ─────────────────────────
  // Searches across: product_variants (sku + ean), variant_barcodes (ean),
  //                  product_suppliers (supplier_sku + product_name)
  let crossTableIds: Set<string> | null = null
  if (search) {
    const q = search
    const [variantRows, barcodeRows, supplierSkuRows] = await Promise.all([
      supabase
        .from('product_variants')
        .select('product_id')
        .or(`internal_variant_sku.ilike.%${q}%,ean.ilike.%${q}%`)
        .not('product_id', 'is', null),
      supabase
        .from('variant_barcodes')
        .select('variant_id')
        .ilike('ean', `%${q}%`),
      supabase
        .from('product_suppliers')
        .select('product_id, variant_id')
        .or(`supplier_sku.ilike.%${q}%,supplier_product_name.ilike.%${q}%`)
        .not('product_id', 'is', null),
    ])

    // For variant_barcodes we need to map variant_id → product_id
    const variantIds = [
      ...(barcodeRows.data ?? []).map(r => r.variant_id as string),
    ].filter(Boolean)

    let barcodeProductIds: string[] = []
    if (variantIds.length > 0) {
      const { data: vRows } = await supabase
        .from('product_variants')
        .select('id, product_id')
        .in('id', variantIds)
        .not('product_id', 'is', null)
      barcodeProductIds = (vRows ?? []).map(r => r.product_id as string).filter(Boolean)
    }

    const allCross = [
      ...(variantRows.data ?? []).map(r => r.product_id as string),
      ...barcodeProductIds,
      ...(supplierSkuRows.data ?? []).map(r => r.product_id as string),
    ].filter(Boolean)

    if (allCross.length > 0) {
      crossTableIds = new Set(allCross)
    }
  }

  // bestillingsnummer hed woo_bestillingsnummer før migration 072 — virker begge veje, så shoppen ikke går ned imens
  const run = async (bnCol: 'bestillingsnummer' | 'woo_bestillingsnummer') => {
  let query = supabase
    .from('products')
    .select(`
      id,
      internal_sku,
      name,
      sales_price,
      sale_price,
      own_stock_quantity,
      own_stock_reserved,
      categories,
      brand,
      status,
      ${bnCol === 'bestillingsnummer' ? 'bestillingsnummer' : 'bestillingsnummer:woo_bestillingsnummer'},
      ean,
      manufacturer_sku,
      weight,
      unit,
      unit_size,
      boat_type,
      hide_when_out_of_stock,
      variant_of_product_id,
      created_at,
      updated_at,
      product_images ( url, alt_text, is_primary, position )
    `, { count: 'exact' })
    .order(sortCol, { ascending: order })
    .range(from, to)

  if (search) {
    // Direct product-table fields
    const directOr = `name.ilike.%${search}%,internal_sku.ilike.%${search}%,${bnCol}.ilike.%${search}%,ean.ilike.%${search}%,manufacturer_sku.ilike.%${search}%,brand.ilike.%${search}%`
    if (crossTableIds && crossTableIds.size > 0) {
      // Combine: product fields OR id in cross-table matches
      const idList = [...crossTableIds].join(',')
      query = query.or(`${directOr},id.in.(${idList})`)
    } else {
      query = query.or(directOr)
    }
  }
  if (status)             query = query.eq('status', status)
  if (shopMode) {
    // Shop: skip archived/rejected AND products that are sub-variants of a parent
    query = query
      .not('status', 'eq', 'archived')
      .not('status', 'eq', 'rejected')
      .is('variant_of_product_id', null)
  }
  if (category)           query = query.contains('categories', [category])
  if (boatType === 'sejlbåd' || boatType === 'motorbåd') {
    const other = boatType === 'sejlbåd' ? 'motorbåd' : 'sejlbåd'
    query = query.or(`boat_type.is.null,boat_type.neq.{${other}}`)
  }
  if (brand)              query = query.eq('brand', brand)
  if (inStock)            query = query.gt('own_stock_quantity', 0)
  if (minPrice)           query = query.gte('sales_price', parseFloat(minPrice))
  if (maxPrice)           query = query.lte('sales_price', parseFloat(maxPrice))
  if (supplierProductIds) query = query.in('id', supplierProductIds)
  return await query
  }

  let res = await run('bestillingsnummer')
  if (res.error && /bestillingsnummer/.test(res.error.message)) res = await run('woo_bestillingsnummer')
  const { data, error, count } = res

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const productList = (data ?? []) as Array<Record<string, unknown> & { id: string }>

  // Fetch variant counts from product_variants table
  const pageIds = productList.map(p => p.id)
  const { data: variantRows } = pageIds.length
    ? await supabase
        .from('product_variants')
        .select('product_id, sales_price')
        .in('product_id', pageIds)
        .eq('status', 'active')
    : { data: [] }

  const variantCounts   = new Map<string, number>()
  const variantMinPrice = new Map<string, number>()
  for (const row of (variantRows ?? []) as { product_id: string; sales_price: number | null }[]) {
    variantCounts.set(row.product_id, (variantCounts.get(row.product_id) ?? 0) + 1)
    if (row.sales_price != null) {
      const cur = variantMinPrice.get(row.product_id)
      if (cur === undefined || row.sales_price < cur) variantMinPrice.set(row.product_id, row.sales_price)
    }
  }

  const products = productList.map(p => {
    const imgs    = (p.product_images as { url: string; is_primary: boolean; position: number }[]) ?? []
    const primary = imgs.find(i => i.is_primary) ?? imgs.sort((a, b) => a.position - b.position)[0]
    const vc      = variantCounts.get(p.id) ?? 0
    return {
      ...p,
      primary_image_url: primary?.url ?? null,
      image_count:       imgs.length,
      variant_count:     vc,
      min_variant_price: vc > 0 ? (variantMinPrice.get(p.id) ?? null) : null,
      product_images:    undefined,
    }
  })

  return NextResponse.json({
    data:        products,
    total:       count ?? 0,
    page,
    per_page:    perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
  })
}

// POST /api/products — opret nyt produkt
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()

  const { data, error } = await supabase
    .from('products')
    .insert({
      internal_sku: `KMB-${ts}-${rnd}`,
      name:         body.name,
      status:       body.status ?? 'draft',
      categories:   body.categories ?? [],
      boat_type:    body.boat_type  ?? [],
    })
    .select('id, internal_sku, name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
