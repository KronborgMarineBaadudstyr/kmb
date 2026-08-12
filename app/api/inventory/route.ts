import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/inventory?search=&status=&stock_filter=low|zero|in_stock&page=1&per_page=50
export async function GET(request: Request) {
  const url         = new URL(request.url)
  const search      = url.searchParams.get('search')       || ''
  const status      = url.searchParams.get('status')       || ''
  const stockFilter = url.searchParams.get('stock_filter') || ''
  const page        = Math.max(1, parseInt(url.searchParams.get('page')     || '1',  10))
  const perPage     = Math.min(200, parseInt(url.searchParams.get('per_page') || '50', 10))
  const sortParam   = url.searchParams.get('sort')  || 'own_stock_quantity'
  const order       = url.searchParams.get('order') === 'desc' ? false : true

  const supabase = createServiceClient()
  const from     = (page - 1) * perPage
  const to       = from + perPage - 1

  const allowedSort = ['name', 'internal_sku', 'own_stock_quantity', 'total_stock']
  const sortCol = allowedSort.includes(sortParam) ? sortParam : 'own_stock_quantity'

  let q = supabase
    .from('products')
    .select(`
      id, name, internal_sku, status, ean,
      own_stock_quantity, own_stock_reserved,
      sales_price,
      product_images ( url, is_primary, position ),
      product_suppliers (
        id, priority, is_active, supplier_stock_quantity, supplier_stock_reserved,
        suppliers ( id, name )
      )
    `, { count: 'exact' })
    .in('status', status ? [status] : ['draft', 'validated', 'published'])
    .range(from, to)

  if (search) {
    q = q.or(`name.ilike.%${search}%,internal_sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }

  // Sort by own_stock_quantity or name
  if (sortCol === 'name') {
    q = q.order('name', { ascending: order })
  } else {
    q = q.order('own_stock_quantity', { ascending: order }).order('name', { ascending: true })
  }

  const { data: products, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (products ?? []).map(p => {
    const imgs = (p.product_images ?? []) as { url: string; is_primary: boolean; position: number }[]
    const primaryImg = imgs.find(i => i.is_primary) ?? imgs.sort((a, b) => a.position - b.position)[0]

    const suppliers = ((p.product_suppliers ?? []) as {
      id: string; priority: number; is_active: boolean
      supplier_stock_quantity: number | null; supplier_stock_reserved: number | null
      suppliers: { id: string; name: string } | null
    }[])
      .filter(s => s.is_active)
      .sort((a, b) => a.priority - b.priority)

    const supplierTotal = suppliers.reduce((n, s) => n + (s.supplier_stock_quantity ?? 0), 0)
    const supplierReserved = suppliers.reduce((n, s) => n + (s.supplier_stock_reserved ?? 0), 0)
    const ownQty = p.own_stock_quantity ?? 0
    const ownRes = p.own_stock_reserved ?? 0
    const totalStock = ownQty + supplierTotal
    const totalAvail = Math.max(0, ownQty - ownRes) + Math.max(0, supplierTotal - supplierReserved)

    return {
      id:                 p.id,
      name:               p.name,
      internal_sku:       p.internal_sku,
      ean:                p.ean,
      status:             p.status,
      sales_price:        p.sales_price,
      primary_image_url:  primaryImg?.url ?? null,
      own_stock_quantity: ownQty,
      own_stock_reserved: ownRes,
      supplier_total:     supplierTotal,
      supplier_reserved:  supplierReserved,
      total_stock:        totalStock,
      total_available:    totalAvail,
      suppliers:          suppliers.map(s => ({
        id:              s.id,
        name:            s.suppliers?.name ?? '—',
        qty:             s.supplier_stock_quantity ?? 0,
        reserved:        s.supplier_stock_reserved ?? 0,
      })),
    }
  })

  // Filter by stock_filter AFTER enrichment (can't do in SQL easily)
  let filtered = rows
  if (stockFilter === 'zero')     filtered = rows.filter(r => r.total_stock === 0)
  else if (stockFilter === 'low') filtered = rows.filter(r => r.total_stock > 0 && r.total_stock < 5)
  else if (stockFilter === 'in_stock') filtered = rows.filter(r => r.total_stock > 0)

  return NextResponse.json({
    data:        filtered,
    total:       count ?? 0,
    total_pages: Math.ceil((count ?? 0) / perPage),
    page,
  })
}
