import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/staging?status=pending_review&supplier_id=&search=&page=1&per_page=50
export async function GET(request: Request) {
  const url        = new URL(request.url)
  const status     = url.searchParams.get('status')      || 'pending_review'
  const supplierId = url.searchParams.get('supplier_id') || ''
  const search     = url.searchParams.get('search')      || ''
  const page       = Math.max(1, parseInt(url.searchParams.get('page')     || '1',  10))
  const perPage    = Math.min(100, parseInt(url.searchParams.get('per_page') || '50', 10))
  const from       = (page - 1) * perPage
  const to         = from + perPage - 1

  const supabase = createServiceClient()

  let query = supabase
    .from('supplier_product_staging')
    .select('*, suppliers(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status !== 'all')  query = query.eq('status', status)
  if (supplierId)        query = query.eq('supplier_id', supplierId)
  if (search)            query = query.ilike('normalized_name', `%${search}%`)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data:        data ?? [],
    total:       count ?? 0,
    page,
    per_page:    perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
  })
}
