import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/admin/auto-actions?search=&type=&status=&page=1&per_page=50
export async function GET(request: Request) {
  const url     = new URL(request.url)
  const search  = url.searchParams.get('search')   ?? ''
  const type    = url.searchParams.get('type')     ?? ''
  const status  = url.searchParams.get('status')   ?? ''
  const runId   = url.searchParams.get('run_id')   ?? ''
  const page    = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1'))
  const perPage = Math.min(100, parseInt(url.searchParams.get('per_page') ?? '50'))
  const from    = (page - 1) * perPage
  const to      = from + perPage - 1

  const supabase = createServiceClient()

  let query = supabase
    .from('pipeline_auto_actions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search)  query = query.or(`staging_name.ilike.%${search}%,product_name.ilike.%${search}%`)
  if (type)    query = query.eq('action_type', type)
  if (status)  query = query.eq('status', status)
  if (runId)   query = query.eq('pipeline_run_id', runId)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach supplier names
  const supplierIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.supplier_id).filter(Boolean))] as string[]
  const supplierMap = new Map<string, string>()
  if (supplierIds.length > 0) {
    const { data: sups } = await supabase.from('suppliers').select('id, name').in('id', supplierIds)
    for (const s of (sups ?? []) as { id: string; name: string }[]) supplierMap.set(s.id, s.name)
  }

  const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    supplier_name: r.supplier_id ? (supplierMap.get(r.supplier_id as string) ?? null) : null,
  }))

  // Distinct run IDs for filter dropdown
  const { data: runs } = await supabase
    .from('pipeline_auto_actions')
    .select('pipeline_run_id')
    .order('pipeline_run_id', { ascending: false })
    .limit(20)
  const runIds = [...new Set((runs ?? []).map((r: Record<string, unknown>) => r.pipeline_run_id as string))]

  return NextResponse.json({
    data: enriched,
    total: count ?? 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
    run_ids: runIds,
  })
}
