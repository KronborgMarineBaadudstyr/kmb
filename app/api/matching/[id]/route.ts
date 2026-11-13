import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/matching/[id] — update suggested_name or status
//
// Ved status='rejected' kan body.bad_ean_supplier_ids angive hvilke leverandør-IDs
// der har et fejlagtigt EAN i denne gruppe. De skrives til supplier_ean_exclusions
// så fremtidige imports og pipeline-kørsel ikke matcher dem forkert igen.
export async function PATCH(request: Request, { params }: RouteParams) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const body   = await request.json() as {
    suggested_name?:        string
    status?:                string
    notes?:                 string
    bad_ean_supplier_ids?:  string[]  // leverandør-IDs med dokumenteret forkert EAN
    member_ids?:            string[]  // kun disse staging-rækker forbliver i gruppen; resten frigøres
    create_as?:             'same' | 'variants' | null      // migration 064
    member_attributes?:     Record<string, { name: string; value: string }[]> | null
  }

  const allowed = ['pending_review', 'confirmed', 'rejected', 'product_created']
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Ugyldig status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.suggested_name !== undefined) update.suggested_name = body.suggested_name
  if (body.status          !== undefined) update.status          = body.status
  if (body.notes           !== undefined) update.notes           = body.notes

  // Samme vare eller varianter (+ egenskaber pr. vare) — se migration 064
  if (body.create_as !== undefined) {
    if (body.create_as !== null && body.create_as !== 'same' && body.create_as !== 'variants') {
      return NextResponse.json({ error: 'Ugyldig create_as' }, { status: 400 })
    }
    update.create_as = body.create_as
  }
  if (body.member_attributes !== undefined) {
    const attrs = cleanMemberAttributes(body.member_attributes, body.member_ids)
    if (attrs === 'invalid') return NextResponse.json({ error: 'Ugyldige variant-egenskaber' }, { status: 400 })
    update.member_attributes = attrs
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('staging_match_groups')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if ((error.code === '42703' || error.code === 'PGRST204') && ('create_as' in update || 'member_attributes' in update)) {
      return NextResponse.json({ error: 'Kør migration 064 i Supabase for at gemme varianter' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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

// Validerer { stagingId: [{name, value}] } — trimmer, dropper tomme værdier og varer der ikke længere er i gruppen
function cleanMemberAttributes(
  raw: unknown, keepIds?: string[],
): Record<string, { name: string; value: string }[]> | null | 'invalid' {
  if (raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'invalid'
  const keep = keepIds ? new Set(keepIds) : null
  const out: Record<string, { name: string; value: string }[]> = {}
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (keep && !keep.has(id)) continue
    if (!Array.isArray(list) || list.length > 10) return 'invalid'
    const clean: { name: string; value: string }[] = []
    for (const a of list) {
      const name  = typeof a?.name  === 'string' ? a.name.trim().slice(0, 50)   : ''
      const value = typeof a?.value === 'string' ? a.value.trim().slice(0, 100) : ''
      if (name && value) clean.push({ name, value })
    }
    out[id] = clean
  }
  return out
}
