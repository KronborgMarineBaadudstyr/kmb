import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cleanAttributeInput } from '@/lib/variant-attributes'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/variant-attributes/[id] — ret navn, enhed, værdier eller rækkefølge
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  // Kun rækkefølge
  if (body && typeof body === 'object' && Object.keys(body).length === 1 && typeof (body as { sort_order?: unknown }).sort_order === 'number') {
    const { error } = await createServiceClient().from('variant_attributes')
      .update({ sort_order: Math.round((body as { sort_order: number }).sort_order) }).eq('id', id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  const input = cleanAttributeInput(body)
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })
  const { data, error } = await createServiceClient()
    .from('variant_attributes').update(input).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `Der findes allerede en egenskab der hedder "${input.name}"` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// DELETE /api/variant-attributes/[id] — fjerner kun definitionen; eksisterende varianters egenskaber røres ikke
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const { error } = await createServiceClient().from('variant_attributes').delete().eq('id', id)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
