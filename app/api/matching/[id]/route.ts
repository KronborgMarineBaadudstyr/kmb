import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/matching/[id] — update suggested_name or status
//
// Ved status='rejected' kan body.bad_ean_supplier_ids angive hvilke leverandør-IDs
// der har et fejlagtigt EAN i denne gruppe. De skrives til supplier_ean_exclusions
// så fremtidige imports og pipeline-kørsel ikke matcher dem forkert igen.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params
  const body   = await request.json() as {
    suggested_name?:        string
    status?:                string
    notes?:                 string
    bad_ean_supplier_ids?:  string[]  // leverandør-IDs med dokumenteret forkert EAN
    member_ids?:            string[]  // kun disse staging-rækker forbliver i gruppen; resten frigøres
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

  // Frigør members der ikke er valgt — sæt match_group_id = null og status = 'pending_review'
  if (body.member_ids) {
    // Find alle nuværende members i gruppen
    const { data: allMembers } = await supabase
      .from('supplier_product_staging')
      .select('id')
      .eq('match_group_id', id)

    const kept    = new Set(body.member_ids)
    const release = (allMembers ?? [])
      .map(m => (m as { id: string }).id)
      .filter(mid => !kept.has(mid))

    if (release.length > 0) {
      await supabase
        .from('supplier_product_staging')
        .update({ match_group_id: null, status: 'pending_review' })
        .in('id', release)
    }
  }

  // Skriv fejl-EAN ekskluderinger hvis angivet (typisk ved afvisning)
  if (
    body.status === 'rejected' &&
    body.bad_ean_supplier_ids?.length &&
    data?.suggested_ean
  ) {
    const exclusions = body.bad_ean_supplier_ids.map(sid => ({
      supplier_id: sid,
      ean:         data.suggested_ean as string,
      reason:      `Afvist gruppe ${id}: leverandørens EAN dokumenteret forkert`,
    }))
    // upsert — idempotent hvis samme (supplier_id, ean) allerede er registreret
    await supabase
      .from('supplier_ean_exclusions')
      .upsert(exclusions, { onConflict: 'supplier_id,ean', ignoreDuplicates: true })
  }

  return NextResponse.json({ ok: true, data })
}
