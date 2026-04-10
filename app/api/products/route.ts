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
  const sort       = url.searchParams.get('sort')  || 'name'
  const order      = url.searchParams.get('order') === 'desc' ? false : true

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

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const products = (data ?? []).map(p => {
    const imgs    = (p.product_images as { url: string; is_primary: boolean; position: number }[]) ?? []
    const primary = imgs.find(i => i.is_primary) ?? imgs.sort((a, b) => a.position - b.position)[0]
    return {
      ...p,
      primary_image_url: primary?.url ?? null,
      image_count:       imgs.length,
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
