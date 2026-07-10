import type { SupabaseClient } from '@supabase/supabase-js'
import { assignProductCategory } from '@/lib/standard-categories'

const MATCH_THRESHOLD = 0.85
const BATCH_SIZE      = 300  // rows per RPC call — keep under statement timeout
const MAX_BATCHES     = 50   // safety ceiling per pipeline run

type StagingRow = {
  id:              string
  supplier_id:     string
  normalized_name: string
  normalized_ean:  string | null
  normalized_sku:  string
  raw_data:        Record<string, unknown>
}

type MatchResult = {
  staging_id:   string
  product_id:   string
  score:        number
  product_name: string
  staging_name: string
  supplier_id:  string
}

type AutoActionLog = {
  pipeline_run_id: string
  action_type:     'auto_match' | 'auto_create'
  staging_id:      string
  product_id:      string
  supplier_id:     string | null
  match_score:     number | null
  staging_name:    string
  product_name:    string
  status:          'applied'
}

function generateSku(): string {
  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `KMB-${ts}-${rnd}`
}

function completenessScore(raw: Record<string, unknown>): number {
  const fields = ['description', 'short_description', 'purchase_price',
    'recommended_sales_price', 'supplier_images', 'brand', 'weight']
  return fields.reduce((n, f) => {
    const v = raw[f]
    if (v == null) return n
    if (typeof v === 'string' && v.trim()) return n + 1
    if (typeof v === 'number') return n + 1
    if (Array.isArray(v) && v.length > 0) return n + 1
    return n
  }, 0)
}

export type AutoStageResult = {
  matched:  number
  created:  number
  skipped:  number
}

export async function processAutoStage(
  supabase:       SupabaseClient,
  runId:          string,
  onProgress:     (matched: number, created: number) => void,
): Promise<AutoStageResult> {
  let totalMatched = 0
  let totalCreated = 0
  let totalSkipped = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const offset = batch * BATCH_SIZE

    // 1. Count remaining unprocessed staging rows
    const { count } = await supabase
      .from('supplier_product_staging')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_review')
      .is('match_group_id', null)

    if (!count || count === 0) break

    // 2. Run fuzzy match RPC for this batch
    const { data: matches, error: rpcErr } = await supabase
      .rpc('auto_match_staging_to_products', {
        threshold:    MATCH_THRESHOLD,
        batch_limit:  BATCH_SIZE,
        batch_offset: 0,  // always offset 0 — matched rows change status so they drop out
      })

    if (rpcErr) throw new Error(`auto_match RPC fejl: ${rpcErr.message}`)

    const matchRows = (matches ?? []) as MatchResult[]
    const matchedStagingIds = new Set(matchRows.map(m => m.staging_id))

    // 3. Fetch all staging rows in this logical batch to find unmatched ones
    const { data: stagingBatch, error: sErr } = await supabase
      .from('supplier_product_staging')
      .select('id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
      .eq('status', 'pending_review')
      .is('match_group_id', null)
      .order('id')
      .limit(BATCH_SIZE)

    if (sErr) throw new Error(`Staging-hentning fejl: ${sErr.message}`)
    const stagingRows = (stagingBatch ?? []) as StagingRow[]
    if (stagingRows.length === 0) break

    const unmatchedRows = stagingRows.filter(r => !matchedStagingIds.has(r.id))
    const actionLogs: AutoActionLog[] = []
    const now = new Date().toISOString()

    // ── A. Auto-match: link staging rows to existing products ─────────────
    if (matchRows.length > 0) {
      // Check which suppliers are already linked to avoid duplicates
      const productIds = [...new Set(matchRows.map(m => m.product_id))]
      const { data: existingLinks } = await supabase
        .from('product_suppliers')
        .select('product_id, supplier_id')
        .in('product_id', productIds)

      const linkedSet = new Set(
        (existingLinks ?? []).map(l => `${l.product_id}:${l.supplier_id}`)
      )

      // Get max priority per product for new supplier inserts
      const { data: maxPrios } = await supabase
        .from('product_suppliers')
        .select('product_id, priority')
        .in('product_id', productIds)
        .order('priority', { ascending: false })

      const maxPrioMap = new Map<string, number>()
      for (const r of (maxPrios ?? []) as { product_id: string; priority: number }[]) {
        if (!maxPrioMap.has(r.product_id) || r.priority > maxPrioMap.get(r.product_id)!) {
          maxPrioMap.set(r.product_id, r.priority)
        }
      }

      // Fetch raw_data for matched staging rows
      const { data: matchedStaging } = await supabase
        .from('supplier_product_staging')
        .select('id, supplier_id, normalized_name, normalized_ean, normalized_sku, raw_data')
        .in('id', matchRows.map(m => m.staging_id))

      const stagingById = new Map<string, StagingRow>(
        ((matchedStaging ?? []) as StagingRow[]).map(r => [r.id, r])
      )

      const supplierInserts: Record<string, unknown>[] = []
      const matchedStagingToUpdate: string[] = []

      for (const match of matchRows) {
        const key = `${match.product_id}:${match.supplier_id}`
        if (linkedSet.has(key)) { totalSkipped++; continue }

        const staging = stagingById.get(match.staging_id)
        if (!staging) continue

        const raw      = staging.raw_data
        const priority = (maxPrioMap.get(match.product_id) ?? 0) + 1
        maxPrioMap.set(match.product_id, priority)

        supplierInserts.push({
          product_id:              match.product_id,
          supplier_id:             match.supplier_id,
          supplier_sku:            staging.normalized_sku,
          supplier_product_name:   typeof raw.supplier_product_name === 'string' ? raw.supplier_product_name : staging.normalized_name,
          purchase_price:          typeof raw.purchase_price === 'number' && isFinite(raw.purchase_price) ? raw.purchase_price : null,
          recommended_sales_price: typeof raw.recommended_sales_price === 'number' && isFinite(raw.recommended_sales_price) ? raw.recommended_sales_price : null,
          supplier_stock_quantity: typeof raw.supplier_stock_quantity === 'number' ? Math.max(0, Math.round(raw.supplier_stock_quantity)) : 0,
          supplier_stock_reserved: 0,
          supplier_images:         Array.isArray(raw.supplier_images) ? raw.supplier_images : [],
          supplier_files:          Array.isArray(raw.supplier_files) ? raw.supplier_files : [],
          priority,
          item_status: 'active',
          is_active:   true,
        })
        matchedStagingToUpdate.push(match.staging_id)

        actionLogs.push({
          pipeline_run_id: runId,
          action_type:     'auto_match',
          staging_id:      match.staging_id,
          product_id:      match.product_id,
          supplier_id:     match.supplier_id,
          match_score:     match.score,
          staging_name:    match.staging_name,
          product_name:    match.product_name,
          status:          'applied',
        })
      }

      if (supplierInserts.length > 0) {
        for (let i = 0; i < supplierInserts.length; i += 200) {
          await supabase.from('product_suppliers').insert(supplierInserts.slice(i, i + 200))
        }
      }
      if (matchedStagingToUpdate.length > 0) {
        for (let i = 0; i < matchedStagingToUpdate.length; i += 500) {
          await supabase.from('supplier_product_staging')
            .update({ status: 'matched', updated_at: now })
            .in('id', matchedStagingToUpdate.slice(i, i + 500))
        }
        totalMatched += matchedStagingToUpdate.length
      }
    }

    // ── B. Auto-create: new draft products for unmatched rows ─────────────
    if (unmatchedRows.length > 0) {
      const productRows = unmatchedRows.map((r, idx) => {
        const raw      = r.raw_data
        const name     = r.normalized_name?.trim() || ''
        const assigned = assignProductCategory(name)
        const cats     = [assigned.category, assigned.subcategory].filter((c): c is string => !!c)

        return {
          internal_sku:      generateSku(),
          name:              name || `Produkt ${idx + 1}`,
          ean:               r.normalized_ean ?? null,
          manufacturer_sku:  typeof raw.manufacturer_sku === 'string' && raw.manufacturer_sku ? raw.manufacturer_sku : null,
          status:            'draft' as const,
          description:       typeof raw.description === 'string' ? raw.description : null,
          short_description: typeof raw.short_description === 'string' ? raw.short_description : null,
          brand:             typeof raw.brand === 'string' ? raw.brand : null,
          weight:            typeof raw.weight === 'number' && isFinite(raw.weight) ? raw.weight : null,
          length:            typeof raw.length === 'number' && isFinite(raw.length) ? raw.length : null,
          width:             typeof raw.width  === 'number' && isFinite(raw.width)  ? raw.width  : null,
          height:            typeof raw.height === 'number' && isFinite(raw.height) ? raw.height : null,
          categories:        cats.length > 0 ? cats : (Array.isArray(raw.categories) ? raw.categories as string[] : []),
          boat_type:         assigned.boatType,
        }
      })

      const { data: inserted, error: pErr } = await supabase
        .from('products')
        .insert(productRows)
        .select('id, internal_sku, name')

      if (pErr) throw new Error(`Auto-create produkt-insert fejl: ${pErr.message}`)

      const skuToProduct = new Map<string, { id: string; name: string }>(
        ((inserted ?? []) as { id: string; internal_sku: string; name: string }[])
          .map(p => [p.internal_sku, { id: p.id, name: p.name }])
      )

      const supplierRows: Record<string, unknown>[] = []
      const createdStagingIds: string[] = []
      const imageInserts: Record<string, unknown>[] = []

      for (let i = 0; i < unmatchedRows.length; i++) {
        const staging   = unmatchedRows[i]
        const product   = skuToProduct.get(productRows[i].internal_sku)
        if (!product) continue

        const raw = staging.raw_data
        supplierRows.push({
          product_id:              product.id,
          supplier_id:             staging.supplier_id,
          supplier_sku:            staging.normalized_sku,
          supplier_product_name:   typeof raw.supplier_product_name === 'string' ? raw.supplier_product_name : staging.normalized_name,
          purchase_price:          typeof raw.purchase_price === 'number' && isFinite(raw.purchase_price) ? raw.purchase_price : null,
          recommended_sales_price: typeof raw.recommended_sales_price === 'number' && isFinite(raw.recommended_sales_price) ? raw.recommended_sales_price : null,
          supplier_stock_quantity: typeof raw.supplier_stock_quantity === 'number' ? Math.max(0, Math.round(raw.supplier_stock_quantity)) : 0,
          supplier_stock_reserved: 0,
          supplier_images:         Array.isArray(raw.supplier_images) ? raw.supplier_images : [],
          supplier_files:          Array.isArray(raw.supplier_files) ? raw.supplier_files : [],
          priority:    1,
          item_status: 'active',
          is_active:   true,
        })

        // Collect images
        const imgs = raw.supplier_images
        if (Array.isArray(imgs)) {
          let pos = 0
          for (const img of imgs as { url?: string; alt_text?: string }[]) {
            if (!img?.url) continue
            imageInserts.push({ product_id: product.id, url: img.url, alt_text: img.alt_text ?? null, is_primary: pos === 0, position: pos++, source: 'auto_stage' })
          }
        }

        createdStagingIds.push(staging.id)
        actionLogs.push({
          pipeline_run_id: runId,
          action_type:     'auto_create',
          staging_id:      staging.id,
          product_id:      product.id,
          supplier_id:     staging.supplier_id,
          match_score:     null,
          staging_name:    staging.normalized_name,
          product_name:    product.name,
          status:          'applied',
        })
      }

      for (let i = 0; i < supplierRows.length; i += 500) {
        await supabase.from('product_suppliers').insert(supplierRows.slice(i, i + 500))
      }
      for (let i = 0; i < imageInserts.length; i += 500) {
        await supabase.from('product_images').insert(imageInserts.slice(i, i + 500))
      }
      for (let i = 0; i < createdStagingIds.length; i += 500) {
        await supabase.from('supplier_product_staging')
          .update({ status: 'matched', updated_at: now })
          .in('id', createdStagingIds.slice(i, i + 500))
      }
      totalCreated += createdStagingIds.length
    }

    // ── C. Write action logs ───────────────────────────────────────────────
    if (actionLogs.length > 0) {
      for (let i = 0; i < actionLogs.length; i += 500) {
        await supabase.from('pipeline_auto_actions').insert(actionLogs.slice(i, i + 500))
      }
    }

    onProgress(totalMatched, totalCreated)

    // Stop if this batch had no results (all remaining are stuck/in-progress)
    if (matchRows.length === 0 && unmatchedRows.length === 0) break
    // Safety: if no rows were processed, break to avoid infinite loop
    if (matchRows.length === 0 && unmatchedRows.length > 0 && completenessScore === completenessScore) {
      // All remaining unmatched rows were processed
      if (stagingRows.length < BATCH_SIZE) break
    }
  }

  return { matched: totalMatched, created: totalCreated, skipped: totalSkipped }
}
