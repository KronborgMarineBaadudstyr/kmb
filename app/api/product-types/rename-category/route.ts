import { createServiceClient } from '@/lib/supabase/server'
import { normalizeCategory, buildDedupeMap } from '@/lib/standard-categories'

// Legacy stubs — these functions were removed when categories were restructured
function stripPrefix(cat: string): string { return cat.replace(/^[A-Za-zÆØÅæøå]+\s*[–\-:]\s*/, '').trim() }
function mapToStandard(cat: string): string | null { const n = normalizeCategory(cat); return n !== cat ? n : null }
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — preview which categories would be renamed
// ?preview=standard  →  show standard-structure mapping
// (no param)         →  show prefix-strip preview
export async function GET(request: Request) {
  const url  = new URL(request.url)
  const mode = url.searchParams.get('preview')

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .select('our_category')
    .not('our_category', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const seen = new Set<string>()

  if (mode === 'standard') {
    const renames: { from: string; to: string; matched: boolean }[] = []
    for (const row of data ?? []) {
      const cat = row.our_category as string
      if (seen.has(cat)) continue
      seen.add(cat)
      const standard = mapToStandard(stripPrefix(cat)) ?? mapToStandard(cat)
      if (standard && standard !== cat) renames.push({ from: cat, to: standard, matched: true })
      else if (!standard) renames.push({ from: cat, to: cat, matched: false })
    }
    return NextResponse.json({ renames })
  }

  // Default: prefix-strip preview
  const renames: { from: string; to: string }[] = []
  for (const row of data ?? []) {
    const cat = row.our_category as string
    if (seen.has(cat)) continue
    seen.add(cat)
    const clean = stripPrefix(cat)
    if (clean !== cat) renames.push({ from: cat, to: clean })
  }
  return NextResponse.json({ renames })
}

// POST — auto_cleanup | apply_standard | rename a specific category
export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json() as {
    auto_cleanup?:    boolean
    apply_standard?:  boolean
    old_category?:    string
    new_category?:    string
    old_subcategory?: string
    new_subcategory?: string
  }

  // ── Auto-cleanup: strip redundant prefixes ─────────────────────
  if (body.auto_cleanup) {
    const { data, error } = await supabase
      .from('product_types')
      .select('our_category')
      .not('our_category', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    let updated = 0

    for (const row of data ?? []) {
      const cat = row.our_category as string
      if (seen.has(cat)) continue
      seen.add(cat)
      const clean = stripPrefix(cat)
      if (clean === cat) continue
      const { error: updErr } = await supabase
        .from('product_types').update({ our_category: clean }).eq('our_category', cat)
      if (!updErr) updated++
    }
    return NextResponse.json({ ok: true, updated })
  }

  // ── Apply standard 15-category structure + fuzzy dedup ────────
  if (body.apply_standard) {
    const { data, error } = await supabase
      .from('product_types')
      .select('our_category')
      .not('our_category', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Phase 1: normalize each category to standard
    const allCats = [...new Set((data ?? []).map(r => r.our_category as string))]
    const phase1: Map<string, string> = new Map()
    for (const cat of allCats) {
      const final = normalizeCategory(cat)
      if (final !== cat) phase1.set(cat, final)
    }

    // Phase 2: build dedupe map on the POST-phase1 names (catches survivors like Styring vs Styring & kontrol)
    const afterPhase1 = allCats.map(c => phase1.get(c) ?? c)
    const phase2 = buildDedupeMap([...new Set(afterPhase1)])

    let updated = 0
    const skipped: string[] = []

    for (const cat of allCats) {
      const afterP1 = phase1.get(cat) ?? cat
      const afterP2 = phase2.get(afterP1) ?? afterP1
      const final   = afterP2

      if (final === cat) {
        // Not in standard — flag it
        const matched = mapToStandard(stripPrefix(cat)) ?? mapToStandard(cat)
        if (!matched && !phase2.has(cat)) skipped.push(cat)
        continue
      }

      const { error: updErr } = await supabase
        .from('product_types').update({ our_category: final }).eq('our_category', cat)
      if (!updErr) updated++
    }
    return NextResponse.json({ ok: true, updated, skipped })
  }

  // ── Single rename / merge ──────────────────────────────────────
  const { old_category, new_category, old_subcategory, new_subcategory } = body

  if (!old_category || !new_category) {
    return NextResponse.json({ error: 'old_category og new_category er påkrævet' }, { status: 400 })
  }

  const updatePayload = {
    our_category: new_category.trim(),
    ...(new_subcategory !== undefined ? { our_subcategory: new_subcategory.trim() || null } : {}),
  }

  let q = supabase.from('product_types').update(updatePayload).eq('our_category', old_category)

  if (old_subcategory !== undefined) {
    q = old_subcategory
      ? q.eq('our_subcategory', old_subcategory)
      : q.is('our_subcategory', null)
  }

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
