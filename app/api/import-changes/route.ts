import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/import-changes
// Query params:
//   supplier_id  – filter by supplier
//   change_type  – 'price_changed' | 'new_product' | 'discontinued'
//   days         – lookback window in days (default 7)
//   page         – page number (default 1)
//   per_page     – results per page (default 50)
export async function GET(request: Request) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const supplierId  = searchParams.get('supplier_id') ?? ''
  const changeType  = searchParams.get('change_type') ?? ''
  const days        = parseInt(searchParams.get('days') ?? '7')
  const page        = parseInt(searchParams.get('page') ?? '1')
  const perPage     = parseInt(searchParams.get('per_page') ?? '50')
  const offset      = (page - 1) * perPage

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let q = supabase
    .from('import_change_log')
    .select(`
      id, change_type, supplier_sku, product_name, seen_at,
      old_purchase_price, new_purchase_price,
      old_recommended_price, new_recommended_price,
      notes, product_id, staging_id,
      suppliers ( id, name )
    `, { count: 'exact' })
    .gte('seen_at', since)
    .order('seen_at', { ascending: false })
    .range(offset, offset + perPage - 1)

  if (supplierId)  q = q.eq('supplier_id', supplierId)
  if (changeType)  q = q.eq('change_type', changeType)

  const { data, count, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    total:       count ?? 0,
    page,
    per_page:    perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
  })
}

// POST /api/import-changes
// Detect discontinued products: items in staging/product_suppliers
// that were NOT updated since the last import run.
// Body: { supplier_id: string, cutoff_hours?: number }
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: { supplier_id: string; cutoff_hours?: number }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const { supplier_id, cutoff_hours = 2 } = body
  if (!supplier_id) return NextResponse.json({ error: 'supplier_id påkrævet' }, { status: 400 })

  // Get supplier's last sync time
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id, name, sync_state')
    .eq('id', supplier_id)
    .single()

  if (!supplier) return NextResponse.json({ error: 'Leverandør ikke fundet' }, { status: 404 })

  const syncState  = (supplier.sync_state ?? {}) as Record<string, unknown>
  const lastSyncAt = syncState.last_sync_at as string | undefined

  if (!lastSyncAt) {
    return NextResponse.json({ error: 'Ingen synkroniseringstidspunkt fundet for leverandøren — kør en import først' }, { status: 400 })
  }

  // Items in supplier_product_staging not updated since last sync
  // (allowing cutoff_hours buffer for long-running imports)
  const cutoff = new Date(new Date(lastSyncAt).getTime() - cutoff_hours * 60 * 60 * 1000).toISOString()

  const { data: stagingGone } = await supabase
    .from('supplier_product_staging')
    .select('id, supplier_id, normalized_sku, normalized_name, updated_at')
    .eq('supplier_id', supplier_id)
    .neq('status', 'rejected')
    .lt('updated_at', cutoff)

  // Items in product_suppliers not updated since last sync
  const { data: supplierGone } = await supabase
    .from('product_suppliers')
    .select('id, supplier_id, supplier_sku, supplier_product_name, product_id, updated_at')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .lt('updated_at', cutoff)

  const toLog: {
    supplier_id: string; change_type: string; supplier_sku: string
    product_name: string | null; product_id: string | null
    staging_id: string | null; notes: string
  }[] = []

  // Dedup: don't log if already logged as discontinued recently (last 24h)
  const { data: recentDiscontinued } = await supabase
    .from('import_change_log')
    .select('supplier_sku')
    .eq('supplier_id', supplier_id)
    .eq('change_type', 'discontinued')
    .gte('seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const alreadyLogged = new Set((recentDiscontinued ?? []).map(r => r.supplier_sku))

  for (const r of stagingGone ?? []) {
    if (alreadyLogged.has(r.normalized_sku)) continue
    toLog.push({
      supplier_id, change_type: 'discontinued',
      supplier_sku:  r.normalized_sku,
      product_name:  r.normalized_name,
      product_id:    null,
      staging_id:    r.id,
      notes: `Ikke set i import siden ${new Date(r.updated_at).toLocaleDateString('da-DK')}`,
    })
    alreadyLogged.add(r.normalized_sku)
  }

  for (const r of supplierGone ?? []) {
    if (alreadyLogged.has(r.supplier_sku)) continue
    toLog.push({
      supplier_id, change_type: 'discontinued',
      supplier_sku:  r.supplier_sku,
      product_name:  r.supplier_product_name,
      product_id:    r.product_id,
      staging_id:    null,
      notes: `Ikke set i import siden ${new Date(r.updated_at).toLocaleDateString('da-DK')}`,
    })
    alreadyLogged.add(r.supplier_sku)
  }

  if (toLog.length === 0) {
    return NextResponse.json({ inserted: 0, message: 'Ingen udgåede produkter fundet' })
  }

  const { error } = await supabase.from('import_change_log').insert(toLog)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    inserted: toLog.length,
    message: `${toLog.length} udgåede produkter registreret for ${supplier.name}`,
  })
}
