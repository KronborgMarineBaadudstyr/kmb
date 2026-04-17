import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchingProgressEvent = {
  stage:          'ean_phase' | 'fuzzy_phase' | 'singles_phase' | 'done' | 'error'
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

// ── Phase 1: EAN grouping — single bulk SQL via RPC ──
async function runEanPhase(
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
): Promise<{ groupsCreated: number; rowsAssigned: number }> {
  onProgress({ stage: 'ean_phase', message: 'EAN-gruppering kører (SQL)...' })

  const { data, error } = await supabase.rpc('create_ean_match_groups', {})
  if (error) throw new Error(`EAN RPC fejl: ${error.message}`)

  const result = data as { groups_created: number; rows_assigned: number }
  return { groupsCreated: result.groups_created, rowsAssigned: result.rows_assigned }
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

    // Phase 3: Singles
    const singles = await runSinglesPhase(db, onProgress)

    const totalGroups = ean.groupsCreated + fuzzy.groupsCreated + singles.groupsCreated
    const totalRows   = ean.rowsAssigned  + fuzzy.rowsAssigned  + singles.rowsAssigned

    onProgress({
      stage:          'done',
      message:        `Matching færdig! ${totalGroups} grupper oprettet — ${ean.groupsCreated} EAN, ${fuzzy.groupsCreated} fuzzy, ${singles.groupsCreated} enkelt-leverandør. ${totalRows} rækker tildelt.`,
      groups_created: totalGroups,
      rows_assigned:  totalRows,
    })
  } catch (err) {
    onProgress({ stage: 'error', message: String(err) })
    throw err
  }
}
