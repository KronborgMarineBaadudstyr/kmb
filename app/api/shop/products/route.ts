import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/shop/products?category=tovvaerk&search=anker&sort=price_asc&page=1&limit=24&boat=sail
export async function GET(request: Request) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const category = searchParams.get('category') ?? ''
  const search   = searchParams.get('search')   ?? ''
  const sort     = searchParams.get('sort')      ?? 'name_asc'
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit    = Math.min(48, parseInt(searchParams.get('limit') ?? '24'))
  const offset   = (page - 1) * limit

  let query = supabase
    .from('products')
    .select(`
      id, name, categories, boat_type, sales_price, status, internal_sku,
      product_images ( url, is_primary, position ),
      product_suppliers ( purchase_price, recommended_sales_price, is_active, suppliers ( name ) )
    `, { count: 'exact' })
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')

  if (category) {
    query = query.contains('categories', [category])
  }

  if (search) {
    // Use RPC for full-field search (name, EAN, SKU, brand, supplier_sku)
    const { data: matchIds } = await supabase
      .rpc('shop_product_search', { search_term: search })
      .order('relevance', { ascending: false })
      .limit(500)

    const ids = ((matchIds ?? []) as { id: string }[]).map(r => r.id)
    if (ids.length === 0) {
      return NextResponse.json({ products: [], total: 0, page, limit, pages: 0 })
    }
    query = query.in('id', ids)
  }

  switch (sort) {
    case 'price_asc':  query = query.order('sales_price', { ascending: true,  nullsFirst: false }); break
    case 'price_desc': query = query.order('sales_price', { ascending: false, nullsFirst: false }); break
    case 'name_desc':  query = query.order('name',        { ascending: false }); break
    default:           query = query.order('name',        { ascending: true  }); break
  }

  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    products: data ?? [],
    total:    count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  })
}
