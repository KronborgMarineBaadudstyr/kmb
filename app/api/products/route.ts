import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products?search=&status=&category=&supplier_id=&page=1&per_page=50&sort=name&order=asc
export async function GET(request: Request) {
  const url        = new URL(request.url)
  const search     = url.searchParams.get('search')      || ''
  const status     = url.searchParams.get('status')      || ''
  const category   = url.searchParams.get('category')    || ''
  const supplierId = url.searchParams.get('supplier_id') || ''
  const page       = Math.max(1, parseInt(url.searchParams.get('page')     || '1',  10))
  const perPage    = Math.min(100, parseInt(url.searchParams.get('per_page') || '50', 10))
  const sort          = url.searchParams.get('sort')  || 'name'
  const order         = url.searchParams.get('order') === 'desc' ? false : true
  const hideVariants  = url.searchParams.get('hide_variants') !== 'false' // default true

  const supabase  = createServiceClient()
  const from      = (page - 1) * perPage
  const to        = from + perPage - 1

  const allowedSortCols = ['name', 'internal_sku', 'sales_price', 'own_stock_quantity', 'created_at', 'updated_at']
  const sortCol   = allowedSortCols.includes(sort) ? sort : 'name'

  // Hvis der filtreres på leverandør, hent produkt-IDs via product_suppliers først
  let supplierProductIds: string[] | null = null
  if (supplierId) {
    const { data: spRows } = await supabase
      .from('product_suppliers')
      .select('product_id')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .not('product_id', 'is', null)

    supplierProductIds = [...new Set((spRows ?? []).map(r => r.product_id).filter(Boolean))]
    // Ingen produkter hos denne leverandør → returner tomt resultat
    if (supplierProductIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, per_page: perPage, total_pages: 0 })
    }
  }

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
      woo_sync_status,
      woo_product_id,
      woo_bestillingsnummer,
      ean,
      manufacturer_sku,
      weight,
      unit,
      unit_size,
      parent_product_id,
      variant_attributes,
      boat_type,
      created_at,
      updated_at,
      product_images ( url, alt_text, is_primary, position )
    `, { count: 'exact' })
    .order(sortCol, { ascending: order })
    .range(from, to)

  if (search) {
    query = query.or(`name.ilike.%${search}%,internal_sku.ilike.%${search}%,woo_bestillingsnummer.ilike.%${search}%,ean.ilike.%${search}%`)
  }
  if (status)               query = query.eq('status', status)
  if (category)             query = query.contains('categories', [category])
  if (supplierProductIds)   query = query.in('id', supplierProductIds)
  if (hideVariants)         query = query.is('parent_product_id', null)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const productList = (data ?? []) as Array<Record<string, unknown> & { id: string }>

  // Fetch variant counts for all products on this page in one query
  const pageIds = productList.map(p => p.id)
  const { data: variantRows } = pageIds.length
    ? await supabase
        .from('products')
        .select('parent_product_id')
        .in('parent_product_id', pageIds)
    : { data: [] }

  const variantCounts = new Map<string, number>()
  for (const row of (variantRows ?? []) as { parent_product_id: string }[]) {
    variantCounts.set(row.parent_product_id, (variantCounts.get(row.parent_product_id) ?? 0) + 1)
  }

  const products = productList.map(p => {
    const imgs    = (p.product_images as { url: string; is_primary: boolean; position: number }[]) ?? []
    const primary = imgs.find(i => i.is_primary) ?? imgs.sort((a, b) => a.position - b.position)[0]
    return {
      ...p,
      primary_image_url: primary?.url ?? null,
      image_count:       imgs.length,
      variant_count:     variantCounts.get(p.id) ?? 0,
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

// POST /api/products — opret nyt produkt (bruges til overprodukt ved bulk variant-sammenkædning)
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
      internal_sku:       `KMB-${ts}-${rnd}`,
      name:               body.name,
      status:             body.status ?? 'draft',
      categories:         body.categories ?? [],
      boat_type:          body.boat_type ?? [],
      variant_attributes: {},
    })
    .select('id, internal_sku, name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
