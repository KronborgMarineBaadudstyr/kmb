import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchingProgressEvent = {
  stage:          'ean_phase' | 'fuzzy_phase' | 'parent_sku_phase' | 'variant_phase' | 'singles_phase' | 'done' | 'error'
  message:        string
  groups_created?: number
  rows_assigned?:  number
  total?:          number
}

type ProgressCallback = (e: MatchingProgressEvent) => void

// ── Union-Find (Disjoint Set) for fuzzy cluster grouping ──
class UnionFind {
  private parent: Map<string, string> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p !== x) {
      const root = this.find(p)
      this.parent.set(x, root)
      return root
    }
    return x
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  clusters(): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    for (const id of this.parent.keys()) {
      const root = this.find(id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(id)
    }
    return groups
  }
}

// ── Phase 1: EAN grouping — done in TypeScript to avoid RPC statement timeout ──
async function runEanPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'ean_phase', message: 'EAN-gruppering kører (henter staging-rækker)...' })

  // Step 1: Load all known EAN exclusions
  const { data: exclusionRows } = await supabase
    .from('supplier_ean_exclusions')
    .select('supplier_id, ean')
  const exclusionSet = new Set<string>(
    (exclusionRows ?? []).map((r: { supplier_id: string; ean: string }) => `${r.supplier_id}||${r.ean}`)
  )

  // Step 2: Fetch all ungrouped staging rows that have an EAN
  type Row = { id: string; supplier_id: string; normalized_ean: string; normalized_name: string }
  const rows: Row[] = []
  const PAGE = 1000
  for (let p = 0; ; p++) {
    const { data, error } = await supabase
      .from('supplier_product_staging')
      .select('id, supplier_id, normalized_ean, normalized_name')
      .not('normalized_ean', 'is', null)
      .neq('normalized_ean', '')
      .is('match_group_id', null)
      .not('status', 'in', '("rejected","matched","new_product")')
      .range(p * PAGE, p * PAGE + PAGE - 1)

    if (error || !data || data.length === 0) break
    for (const r of data as Row[]) {
      // Skip rows whose (supplier_id, ean) is in the exclusions set
      if (exclusionSet.has(`${r.supplier_id}||${r.normalized_ean}`)) continue
      rows.push(r)
    }
    if (data.length < PAGE) break
  }

  onProgress({ stage: 'ean_phase', message: `${rows.length.toLocaleString('da-DK')} rækker med EAN fundet — grupperer...` })

  // Step 3: Group by EAN in TypeScript
  const byEan = new Map<string, Row[]>()
  for (const row of rows) {
    if (!byEan.has(row.normalized_ean)) byEan.set(row.normalized_ean, [])
    byEan.get(row.normalized_ean)!.push(row)
  }

  let groupsCreated = 0
  let rowsAssigned  = 0

  // Step 4: Only create EAN groups for cross-supplier matches (2+ suppliers).
  // Single-supplier EAN rows are handled by the singles phase — no need to create
  // 45k single-supplier groups here that would just bloat the pipeline.
  const eanEntries = [...byEan.entries()].filter(([, members]) =>
    new Set(members.map(r => r.supplier_id)).size >= 2
  )
  const GROUP_BATCH = 500

  for (let i = 0; i < eanEntries.length; i += GROUP_BATCH) {
    const chunk = eanEntries.slice(i, i + GROUP_BATCH)

    const toInsert = chunk.map(([ean, members]) => {
      const distinctSuppliers = new Set(members.map(r => r.supplier_id))
      const bestName = members.reduce((best, r) =>
        (r.normalized_name ?? '').length > best.length ? (r.normalized_name ?? '') : best, '')
      return {
        match_confidence: 'high',
        match_method:     distinctSuppliers.size >= 2 ? 'ean' : 'single',
        supplier_count:   distinctSuppliers.size,
        suggested_name:   bestName,
        suggested_ean:    ean,
        status:           'pending_review',
      }
    })

    const { data: inserted, error: gErr } = await supabase
      .from('staging_match_groups')
      .insert(toInsert)
      .select('id, suggested_ean')

    if (gErr || !inserted) {
      console.error('[matching-engine] EAN batch insert error:', gErr?.message)
      continue
    }

    groupsCreated += inserted.length

    onProgress({
      stage: 'ean_phase',
      message: `EAN-gruppering: ${groupsCreated.toLocaleString('da-DK')} / ${eanEntries.length.toLocaleString('da-DK')} grupper oprettet…`,
    })
  }

  // Single SQL pass to assign all staging rows to their group via normalized_ean join
  const { data: assignedCount, error: assignErr } = await supabase.rpc('assign_ean_groups')
  if (assignErr) {
    console.error('[matching-engine] assign_ean_groups RPC error:', assignErr.message)
  }
  rowsAssigned = (assignedCount as number) ?? 0

  // Recalculate match_method for all groups:
  //   single-supplier 'ean' groups → downgrade to 'single'
  //   multi-supplier  'single' groups → upgrade to 'ean'
  // This handles both old mis-classified groups and the "second supplier arrives" scenario.
  const { data: syncResult, error: syncErr } = await supabase.rpc('sync_group_methods')
  if (syncErr) {
    console.error('[matching-engine] sync_group_methods RPC error:', syncErr.message)
  } else if (syncResult) {
    const { upgraded, downgraded } = syncResult as { upgraded: number; downgraded: number }
    if (upgraded > 0 || downgraded > 0) {
      onProgress({
        stage: 'ean_phase',
        message: `Gruppe-metoder synkroniseret: ${upgraded} opgraderet til EAN, ${downgraded} nedgraderet til enkelt`,
      })
    }
  }

  return { groupsCreated, rowsAssigned }
}

// ── Phase 2: Fuzzy name grouping (cross-supplier only) ──
// NOTE: This phase uses a SQL RPC with first-3-word bucketing to avoid
// a full O(n^2) self-join. For very large datasets (>50k rows) this may
// still be slow — consider adding a pg_trgm index on normalized_name if needed.
async function runFuzzyPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'fuzzy_phase', message: 'Kører fuzzy navn-matching (henter par fra database)...' })

  // Call the find_fuzzy_staging_matches RPC defined in migration 011
  const { data: pairs, error } = await supabase.rpc('find_fuzzy_staging_matches', { min_score: 0.65 })

  if (error) {
    // If the RPC doesn't exist yet or fails, skip fuzzy phase gracefully
    console.error('[matching-engine] fuzzy RPC error:', error.message)
    onProgress({ stage: 'fuzzy_phase', message: `Fuzzy-fase sprunget over (RPC-fejl: ${error.message})` })
    return { groupsCreated: 0, rowsAssigned: 0 }
  }

  if (!pairs || pairs.length === 0) {
    onProgress({ stage: 'fuzzy_phase', message: 'Fuzzy-fase: ingen kryds-leverandør par fundet.' })
    return { groupsCreated: 0, rowsAssigned: 0 }
  }

  onProgress({
    stage: 'fuzzy_phase',
    message: `${pairs.length.toLocaleString('da-DK')} fuzzy par fundet — bygger klynger...`,
    total: pairs.length,
  })

  // We need supplier_id for each staging row to verify cross-supplier
  // Collect all IDs mentioned in pairs
  const allIds = new Set<string>()
  for (const pair of pairs as { id_a: string; id_b: string; score: number }[]) {
    allIds.add(pair.id_a)
    allIds.add(pair.id_b)
  }

  const idList = [...allIds]
  const supplierMap = new Map<string, string>() // id -> supplier_id
  const nameMap     = new Map<string, string>() // id -> normalized_name

  // Fetch supplier_id for all involved rows in batches of 500
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500)
    const { data: rows } = await supabase
      .from('supplier_product_staging')
      .select('id, supplier_id, normalized_name')
      .in('id', chunk)
    if (rows) {
      for (const r of rows as { id: string; supplier_id: string; normalized_name: string }[]) {
        supplierMap.set(r.id, r.supplier_id)
        nameMap.set(r.id, r.normalized_name)
      }
    }
  }

  // Build union-find — only union cross-supplier pairs
  const uf = new UnionFind()

  // Initialize all IDs in union-find
  for (const id of idList) uf.find(id)

  for (const pair of pairs as { id_a: string; id_b: string; score: number }[]) {
    const supA = supplierMap.get(pair.id_a)
    const supB = supplierMap.get(pair.id_b)
    if (supA && supB && supA !== supB) {
      uf.union(pair.id_a, pair.id_b)
    }
  }

  const clusters = uf.clusters()
  let groupsCreated = 0
  let rowsAssigned  = 0

  for (const [, members] of clusters) {
    if (members.length < 2) continue // single rows handled in singles phase

    const distinctSuppliers = new Set(members.map(id => supplierMap.get(id)).filter(Boolean))
    if (distinctSuppliers.size < 2) continue // skip single-supplier fuzzy clusters

    const suggestedName = members.reduce((best, id) => {
      const n = nameMap.get(id) ?? ''
      return n.length > best.length ? n : best
    }, '')

    const { data: group, error: gErr } = await supabase
      .from('staging_match_groups')
      .insert({
        match_confidence: 'medium',
        match_method:     'fuzzy_name',
        supplier_count:   distinctSuppliers.size,
        suggested_name:   suggestedName,
        suggested_ean:    null,
        status:           'pending_review',
      })
      .select('id')
      .single()

    if (gErr || !group) {
      console.error('[matching-engine] insert fuzzy group error:', gErr?.message)
      continue
    }

    groupsCreated++

    const { error: uErr } = await supabase
      .from('supplier_product_staging')
      .update({ match_group_id: group.id })
      .in('id', members)

    if (uErr) {
      console.error('[matching-engine] update fuzzy staging:', uErr.message)
    } else {
      rowsAssigned += members.length
    }
  }

  return { groupsCreated, rowsAssigned }
}

// ── Phase 2.2: Parent-SKU grouping — same supplier, explicit parent_sku relation ──
// Finds staging rows that have raw_data.supplier_parent_sku set and groups them
// by (supplier_id, supplier_parent_sku). These are explicit variant families
// as declared by the supplier (Palby MasterItemId, Kap-Horn parent SKU, etc.).
async function runParentSkuPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'parent_sku_phase', message: 'Parent-SKU variant-gruppering kører…' })

  type Row = { id: string; supplier_id: string; normalized_name: string; raw_data: Record<string, unknown> }
  const rows: Row[] = []
  const PAGE = 1000

  for (let p = 0; ; p++) {
    const { data, error } = await supabase
      .from('supplier_product_staging')
      .select('id, supplier_id, normalized_name, raw_data')
      .is('match_group_id', null)
      .in('status', ['pending_review', 'needs_review'])
      .range(p * PAGE, p * PAGE + PAGE - 1)

    if (error) { console.error('[matching-engine] parent_sku phase fetch:', error.message); break }
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
  }

  // Group by (supplier_id, supplier_parent_sku) — only rows that declare a parent
  const buckets = new Map<string, string[]>()
  const nameMap = new Map<string, string>()

  for (const row of rows) {
    nameMap.set(row.id, row.normalized_name ?? '')
    const parentSku = typeof row.raw_data?.supplier_parent_sku === 'string' && row.raw_data.supplier_parent_sku
      ? row.raw_data.supplier_parent_sku as string
      : null
    if (!parentSku) continue

    const key = `${row.supplier_id}||${parentSku}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(row.id)
  }

  let groupsCreated = 0
  let rowsAssigned  = 0

  const eligible = [...buckets.entries()].filter(([, members]) => members.length >= 2)
  const BATCH = 500

  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH)

    const toInsert = chunk.map(([, members]) => ({
      match_confidence: 'high',
      match_method:     'parent_sku',
      supplier_count:   1,
      suggested_name:   members.map(id => nameMap.get(id) ?? '').reduce((best, n) => (n.length > 0 && n.length < best.length) ? n : best),
      suggested_ean:    null,
      status:           'pending_review',
    }))

    const { data: inserted, error: gErr } = await supabase
      .from('staging_match_groups')
      .insert(toInsert)
      .select('id')

    if (gErr || !inserted) { console.error('[matching-engine] parent_sku batch insert:', gErr?.message); continue }
    groupsCreated += inserted.length

    const groupIds = (inserted as { id: string }[]).map(g => g.id)
    for (let j = 0; j < chunk.length; j++) {
      const groupId = groupIds[j]
      const members = chunk[j][1]
      if (!groupId) continue
      for (let k = 0; k < members.length; k += 500) {
        const { error: uErr } = await supabase
          .from('supplier_product_staging')
          .update({ match_group_id: groupId })
          .in('id', members.slice(k, k + 500))
        if (!uErr) rowsAssigned += Math.min(500, members.length - k)
      }
    }
  }

  return { groupsCreated, rowsAssigned }
}

// ── Phase 2.5: Variant grouping — same supplier, identical normalized name ──
// Finds staging rows that are NOT yet assigned a group, grouped by
// (supplier_id, normalized_name). Groups of 2+ are same-product variants
// (e.g. different sizes/SKUs of the same item from one supplier).
async function runVariantPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'variant_phase', message: 'Variant-gruppering kører…' })

  // Fetch all unmatched rows — only the fields we need
  type Row = { id: string; supplier_id: string; normalized_name: string }
  const rows: Row[] = []
  const PAGE = 1000
  for (let p = 0; ; p++) {
    const { data, error } = await supabase
      .from('supplier_product_staging')
      .select('id, supplier_id, normalized_name')
      .is('match_group_id', null)
      .in('status', ['pending_review', 'needs_review'])
      .not('normalized_name', 'is', null)
      .range(p * PAGE, p * PAGE + PAGE - 1)

    if (error) {
      console.error('[matching-engine] variant phase fetch error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
  }

  // Group by supplier_id + normalized_name
  const buckets = new Map<string, string[]>() // key → [id, ...]
  for (const row of rows) {
    const key = `${row.supplier_id}||${(row.normalized_name ?? '').toLowerCase().trim()}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(row.id)
  }

  let groupsCreated = 0
  let rowsAssigned  = 0

  const nameMap = new Map(rows.map(r => [r.id, r.normalized_name ?? '']))
  const eligible = [...buckets.entries()].filter(([, members]) => members.length >= 2)
  const BATCH = 500

  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH)

    const toInsert = chunk.map(([, members]) => ({
      match_confidence: 'high',
      match_method:     'variant',
      supplier_count:   1,
      suggested_name:   nameMap.get(members[0]) ?? '',
      suggested_ean:    null,
      status:           'pending_review',
    }))

    const { data: inserted, error: gErr } = await supabase
      .from('staging_match_groups')
      .insert(toInsert)
      .select('id')

    if (gErr || !inserted) { console.error('[matching-engine] variant batch insert:', gErr?.message); continue }
    groupsCreated += inserted.length

    const groupIds = (inserted as { id: string }[]).map(g => g.id)
    for (let j = 0; j < chunk.length; j++) {
      const groupId = groupIds[j]
      const members = chunk[j][1]
      if (!groupId) continue
      for (let k = 0; k < members.length; k += 500) {
        const { error: uErr } = await supabase
          .from('supplier_product_staging')
          .update({ match_group_id: groupId })
          .in('id', members.slice(k, k + 500))
        if (!uErr) rowsAssigned += Math.min(500, members.length - k)
      }
    }
  }

  return { groupsCreated, rowsAssigned }
}

// ── Phase 3: Singles — single bulk SQL via RPC ──
async function runSinglesPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'singles_phase', message: 'Enkelt-leverandør gruppering kører (SQL)...' })

  const { data, error } = await supabase.rpc('create_single_supplier_groups', {})
  if (error) throw new Error(`Singles RPC fejl: ${error.message}`)

  const result = data as { groups_created: number; rows_assigned: number }
  return { groupsCreated: result.groups_created, rowsAssigned: result.rows_assigned }
}

// ── Main entry point ──
export async function runMatchingEngine(
  onProgress: ProgressCallback,
  supabase?: SupabaseClient,
): Promise<void> {
  const db = supabase ?? createServiceClient()

  try {
    // Phase 1: EAN grouping
    const ean = await runEanPhase(db, onProgress)

    onProgress({
      stage:          'ean_phase',
      message:        `EAN-fase færdig: ${ean.groupsCreated} grupper, ${ean.rowsAssigned} rækker tildelt`,
      groups_created: ean.groupsCreated,
      rows_assigned:  ean.rowsAssigned,
    })

    // Phase 2: Fuzzy name grouping
    const fuzzy = await runFuzzyPhase(db, onProgress)

    onProgress({
      stage:          'fuzzy_phase',
      message:        `Fuzzy-fase færdig: ${fuzzy.groupsCreated} grupper, ${fuzzy.rowsAssigned} rækker tildelt`,
      groups_created: ean.groupsCreated + fuzzy.groupsCreated,
      rows_assigned:  ean.rowsAssigned + fuzzy.rowsAssigned,
    })

    // Phase 2.2: Parent-SKU grouping (same supplier, explicit supplier_parent_sku relation)
    const parentSku = await runParentSkuPhase(db, onProgress)

    onProgress({
      stage:          'parent_sku_phase',
      message:        `Parent-SKU-fase færdig: ${parentSku.groupsCreated} variant-grupper (leverandør-deklarerede), ${parentSku.rowsAssigned} rækker tildelt`,
      groups_created: ean.groupsCreated + fuzzy.groupsCreated + parentSku.groupsCreated,
      rows_assigned:  ean.rowsAssigned + fuzzy.rowsAssigned + parentSku.rowsAssigned,
    })

    // Phase 2.5: Variant grouping (same supplier, identical name — fallback)
    const variants = await runVariantPhase(db, onProgress)

    onProgress({
      stage:          'variant_phase',
      message:        `Navn-variant-fase færdig: ${variants.groupsCreated} variant-grupper, ${variants.rowsAssigned} rækker tildelt`,
      groups_created: ean.groupsCreated + fuzzy.groupsCreated + parentSku.groupsCreated + variants.groupsCreated,
      rows_assigned:  ean.rowsAssigned + fuzzy.rowsAssigned + parentSku.rowsAssigned + variants.rowsAssigned,
    })

    // Phase 3: Singles
    const singles = await runSinglesPhase(db, onProgress)

    const totalGroups = ean.groupsCreated + fuzzy.groupsCreated + parentSku.groupsCreated + variants.groupsCreated + singles.groupsCreated
    const totalRows   = ean.rowsAssigned  + fuzzy.rowsAssigned  + parentSku.rowsAssigned  + variants.rowsAssigned  + singles.rowsAssigned

    onProgress({
      stage:          'done',
      message:        `Matching færdig! ${totalGroups} grupper — ${ean.groupsCreated} EAN, ${fuzzy.groupsCreated} fuzzy, ${parentSku.groupsCreated} parent-SKU varianter, ${variants.groupsCreated} navn-varianter, ${singles.groupsCreated} enkelt-leverandør. ${totalRows} rækker tildelt.`,
      groups_created: totalGroups,
      rows_assigned:  totalRows,
    })
  } catch (err) {
    onProgress({ stage: 'error', message: String(err) })
    throw err
  }
}
