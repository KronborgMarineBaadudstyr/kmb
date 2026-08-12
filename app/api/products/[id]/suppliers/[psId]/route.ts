import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; psId: string }> }
) {
  const { psId } = await params
  const supabase  = createServiceClient()
  const body      = await request.json() as Record<string, unknown>

  const allowed: Record<string, unknown> = {}
  if (body.priority    != null) allowed.priority    = Number(body.priority)
  if (body.is_active   != null) allowed.is_active   = Boolean(body.is_active)

  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: 'Ingen tilladte felter' }, { status: 400 })

  const { error } = await supabase
    .from('product_suppliers')
    .update(allowed)
    .eq('id', psId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
