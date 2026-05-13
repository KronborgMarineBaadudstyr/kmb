import { createServiceClient } from '@/lib/supabase/server'
import { createProductFromGroup } from '@/lib/product-creator'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

// POST /api/pipeline/auto-create
// Auto-creates products for all confirmed match groups that don't have a product yet.
// Returns { created, skipped, errors }
export async function POST() {
  const supabase = createServiceClient()

  // Load all confirmed groups without a product
  const confirmed: { id: string; suggested_name: string | null }[] = []
  const PAGE = 200
  for (let p = 0; ; p++) {
    const { data, error } = await supabase
      .from('staging_match_groups')
      .select('id, suggested_name')
      .eq('status', 'confirmed')
      .is('product_id', null)
      .range(p * PAGE, p * PAGE + PAGE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    confirmed.push(...(data as { id: string; suggested_name: string | null }[]))
    if (data.length < PAGE) break
  }

  if (confirmed.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, errors: 0, message: 'Ingen bekræftede grupper afventer produktoprettelse' })
  }

  // For each group, get member names if suggested_name is missing
  const groupIds = confirmed.map(g => g.id)

  const { data: members } = await supabase
    .from('supplier_product_staging')
    .select('match_group_id, normalized_name, raw_data')
    .in('match_group_id', groupIds)

  // Build a map from group_id → best name
  const membersByGroup = new Map<string, { normalized_name: string; raw_data: Record<string, unknown> }[]>()
  for (const m of (members ?? [])) {
    const gid = (m as { match_group_id: string }).match_group_id
    if (!membersByGroup.has(gid)) membersByGroup.set(gid, [])
    membersByGroup.get(gid)!.push(m as { normalized_name: string; raw_data: Record<string, unknown> })
  }

  function pickName(group: { id: string; suggested_name: string | null }): string | null {
    if (group.suggested_name?.trim()) return group.suggested_name.trim()
    const ms = membersByGroup.get(group.id) ?? []
    if (ms.length === 0) return null
    // Pick the member with the longest normalized_name as a heuristic
    const best = ms.reduce((a, b) =>
      (a.normalized_name?.length ?? 0) >= (b.normalized_name?.length ?? 0) ? a : b
    )
    return best.normalized_name?.trim() || null
  }

  let created = 0
  let skipped = 0
  let errors  = 0

  for (const group of confirmed) {
    const name = pickName(group)
    if (!name) { skipped++; continue }

    try {
      await createProductFromGroup(group.id, name, supabase)
      created++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
