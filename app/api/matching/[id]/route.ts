import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/matching/[id] — update suggested_name or status
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params
  const body   = await request.json() as {
    suggested_name?: string
    status?:         string
    notes?:          string
  }

  const allowed = ['pending_review', 'confirmed', 'rejected', 'product_created']
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Ugyldig status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.suggested_name !== undefined) update.suggested_name = body.suggested_name
  if (body.status          !== undefined) update.status          = body.status
  if (body.notes           !== undefined) update.notes           = body.notes

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('staging_match_groups')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data })
}
