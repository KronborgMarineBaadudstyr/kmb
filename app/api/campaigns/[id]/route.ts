import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED = [
  'name', 'description', 'record_type', 'is_active',
  'discount_pct', 'kit_price', 'starts_at', 'ends_at',
  'start_date', 'end_date', 'status',
  'type', 'discount_type', 'discount_value', 'bundle_qty',
]

// PATCH /api/campaigns/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field]
    }
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/campaigns/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Delete related campaign_products first
  await supabase.from('campaign_products').delete().eq('campaign_id', id)

  const { error } = await supabase.from('campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
