import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse }        from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }   = await params
  const supabase = createServiceClient()
  const body     = await request.json()

  // Hent eksisterende sync_state så vi kan merge
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('sync_state')
    .eq('id', id)
    .single()

  const existing = (supplier?.sync_state ?? {}) as Record<string, unknown>

  const { error } = await supabase
    .from('suppliers')
    .update({ sync_state: { ...existing, ...body.sync_state } })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
