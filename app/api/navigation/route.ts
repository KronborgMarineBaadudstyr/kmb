import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/navigation?boat_type=sailboat|motorboat
// Returns all active hotspots for the given boat type (or all if no filter)
export async function GET(request: Request) {
  const supabase   = createServiceClient()
  const boatType   = new URL(request.url).searchParams.get('boat_type') ?? ''
  const includeAll = new URL(request.url).searchParams.get('all') === '1'

  let q = supabase
    .from('boat_hotspots')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (boatType)   q = q.eq('boat_type', boatType)
  if (!includeAll) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/navigation
// Body: { boat_type, label, category_slug, description?, x_pct, y_pct, label_side?, color?, sort_order? }
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const { boat_type, label, category_slug, x_pct, y_pct } = body
  if (!boat_type || !label || !category_slug || x_pct == null || y_pct == null) {
    return NextResponse.json({ error: 'boat_type, label, category_slug, x_pct og y_pct er påkrævet' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('boat_hotspots')
    .insert({
      boat_type,
      label,
      category_slug,
      description: body.description ?? null,
      x_pct:       Number(x_pct),
      y_pct:       Number(y_pct),
      label_side:  body.label_side  ?? 'right',
      color:       body.color       ?? '#1d4ed8',
      sort_order:  body.sort_order  ?? 0,
      is_active:   body.is_active   ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH /api/navigation?id=xxx
export async function PATCH(request: Request) {
  const supabase = createServiceClient()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id påkrævet' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const ALLOWED = ['label', 'category_slug', 'description', 'x_pct', 'y_pct', 'label_side', 'color', 'sort_order', 'is_active']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('boat_hotspots')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/navigation?id=xxx
export async function DELETE(request: Request) {
  const supabase = createServiceClient()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id påkrævet' }, { status: 400 })

  const { error } = await supabase.from('boat_hotspots').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
