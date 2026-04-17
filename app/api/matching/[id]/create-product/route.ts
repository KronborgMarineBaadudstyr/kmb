import { createServiceClient } from '@/lib/supabase/server'
import { createProductFromGroup } from '@/lib/product-creator'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/matching/[id]/create-product
// Body: { chosen_name: string }
export async function POST(request: Request, { params }: RouteParams) {
  const { id }   = await params
  const body      = await request.json() as { chosen_name?: string }
  const chosenName = (body.chosen_name ?? '').trim()

  if (!chosenName) {
    return NextResponse.json({ error: 'chosen_name er påkrævet' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify group exists and isn't already created
  const { data: group, error: gErr } = await supabase
    .from('staging_match_groups')
    .select('id, status')
    .eq('id', id)
    .single()

  if (gErr || !group) {
    return NextResponse.json({ error: 'Gruppe ikke fundet' }, { status: 404 })
  }

  if ((group as { status: string }).status === 'product_created') {
    return NextResponse.json({ error: 'Produkt er allerede oprettet for denne gruppe' }, { status: 409 })
  }

  try {
    const result = await createProductFromGroup(id, chosenName, supabase)
    return NextResponse.json({ ok: true, product_id: result.product_id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
