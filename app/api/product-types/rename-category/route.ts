import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Prefixes that are always redundant in a boat-equipment webshop context
const REDUNDANT_PREFIXES = [
  'Bådens ', 'Baadens ', 'Båd ', 'Baad ',
  'Marine ', 'Maritim ', 'Maritimt ',
  'Skibets ', 'Skibs ',
]

function stripPrefix(name: string): string {
  const lower = name.toLowerCase()
  for (const prefix of REDUNDANT_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase())) {
      const stripped = name.slice(prefix.length).trim()
      return stripped.charAt(0).toUpperCase() + stripped.slice(1)
    }
  }
  return name
}

// GET — preview which categories would be renamed by auto-cleanup
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .select('our_category')
    .not('our_category', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const renames: { from: string; to: string }[] = []
  const seen = new Set<string>()
  for (const row of data ?? []) {
    const cat = row.our_category as string
    if (seen.has(cat)) continue
    seen.add(cat)
    const clean = stripPrefix(cat)
    if (clean !== cat) renames.push({ from: cat, to: clean })
  }

  return NextResponse.json({ renames })
}

// POST — either auto_cleanup (strip all prefixes) or rename a specific category
export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json() as {
    auto_cleanup?:    boolean
    old_category?:    string
    new_category?:    string
    old_subcategory?: string
    new_subcategory?: string
  }

  // ── Auto-cleanup mode ──────────────────────────────────────────
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
        .from('product_types')
        .update({ our_category: clean })
        .eq('our_category', cat)

      if (!updErr) updated++
    }

    return NextResponse.json({ ok: true, updated })
  }

  // ── Single rename / merge mode ─────────────────────────────────
  const { old_category, new_category, old_subcategory, new_subcategory } = body

  if (!old_category || !new_category) {
    return NextResponse.json({ error: 'old_category og new_category er påkrævet' }, { status: 400 })
  }

  const updatePayload = {
    our_category: new_category.trim(),
    ...(new_subcategory !== undefined ? { our_subcategory: new_subcategory.trim() || null } : {}),
  }

  let q = supabase
    .from('product_types')
    .update(updatePayload)
    .eq('our_category', old_category)

  if (old_subcategory !== undefined) {
    q = old_subcategory
      ? q.eq('our_subcategory', old_subcategory)
      : q.is('our_subcategory', null)
  }

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
