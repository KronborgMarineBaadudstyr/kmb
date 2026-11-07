import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// PATCH /api/products/lifespan  { product_ids: string[], months: number | null, note?: string | null }
export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Ikke logget ind' }, { status: 401 })

  let body: { product_ids?: unknown; months?: unknown; note?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const ids = Array.isArray(body.product_ids) ? body.product_ids.filter((x): x is string => typeof x === 'string') : []
  if (ids.length === 0 || ids.length > 1000) return NextResponse.json({ error: 'Vælg 1–1000 produkter' }, { status: 400 })

  const months = body.months == null || body.months === '' ? null : Math.round(Number(body.months))
  if (months !== null && !(months >= 1 && months <= 600))
    return NextResponse.json({ error: 'Levetid skal være 1–600 måneder' }, { status: 400 })

  const updates: Record<string, unknown> = { expected_lifespan_months: months, updated_at: new Date().toISOString() }
  if (typeof body.note === 'string') updates.lifespan_note = body.note.trim() || null

  const { error, count } = await createServiceClient()
    .from('products').update(updates, { count: 'exact' }).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: count ?? ids.length })
}
