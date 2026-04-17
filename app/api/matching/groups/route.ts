import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/matching/groups?status=pending_review&confidence=high&page=1&per_page=50
export async function GET(request: Request) {
  const url        = new URL(request.url)
  const status     = url.searchParams.get('status')     || 'pending_review'
  const confidence = url.searchParams.get('confidence') || ''
  const method     = url.searchParams.get('method')     || ''
  const page       = Math.max(1,   parseInt(url.searchParams.get('page')     || '1',  10))
  const perPage    = Math.min(100, parseInt(url.searchParams.get('per_page') || '50', 10))
  const from       = (page - 1) * perPage
  const to         = from + perPage - 1

  const supabase = createServiceClient()

  // Fetch groups
  let query = supabase
    .from('staging_match_groups')
    .select('*', { count: 'exact' })
    .order('supplier_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status !== 'all') query = query.eq('status', status)
  if (confidence)       query = query.eq('match_confidence', confidence)
  if (method)           query = query.eq('match_method', method)

  const { data: groups, error: gErr, count } = await query
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  if (!groups || groups.length === 0) {
    return NextResponse.json({ data: [], total: count ?? 0, page, per_page: perPage, total_pages: 0 })
  }

  const groupIds = groups.map((g: { id: string }) => g.id)

  // Fetch staging members for these groups (with supplier name)
  const { data: members, error: mErr } = await supabase
    .from('supplier_product_staging')
    .select('id, match_group_id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data, suppliers(name)')
    .in('match_group_id', groupIds)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // Attach members to their groups
  const membersByGroup = new Map<string, typeof members>()
  for (const m of (members ?? [])) {
    const gid = (m as { match_group_id: string }).match_group_id
    if (!membersByGroup.has(gid)) membersByGroup.set(gid, [])
    membersByGroup.get(gid)!.push(m)
  }

  // Fetch stats (total counts by status and confidence)
  const { data: statRows } = await supabase
    .from('staging_match_groups')
    .select('status, match_confidence, match_method')

  const stats = {
    total:        statRows?.length ?? 0,
    high:         statRows?.filter(r => r.match_confidence === 'high' && r.match_method !== 'single').length ?? 0,
    medium:       statRows?.filter(r => r.match_confidence === 'medium').length ?? 0,
    single:       statRows?.filter(r => r.match_method === 'single').length ?? 0,
    confirmed:    statRows?.filter(r => r.status === 'confirmed').length ?? 0,
    rejected:     statRows?.filter(r => r.status === 'rejected').length ?? 0,
    created:      statRows?.filter(r => r.status === 'product_created').length ?? 0,
  }

  const enriched = (groups as Array<{
    id: string
    status: string
    match_confidence: string
    match_method: string
    supplier_count: number
    suggested_name: string | null
    suggested_ean: string | null
    product_id: string | null
    notes: string | null
    created_at: string
    updated_at: string
  }>).map(g => ({
    ...g,
    members: membersByGroup.get(g.id) ?? [],
  }))

  return NextResponse.json({
    data:        enriched,
    total:       count ?? 0,
    page,
    per_page:    perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
    stats,
  })
}
