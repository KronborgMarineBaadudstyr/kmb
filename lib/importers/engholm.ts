import { createServiceClient } from '@/lib/supabase/server'
import { normalizeUnit, resolveUnit } from './unit-normalizer'
import { flagRecentlyImportedForReview } from '@/lib/review-checker'

const SUPPLIER_ID = '37d879e5-c0f7-48ae-b514-168264c80f9f'
const API_URL     = 'https://www.engholm.dk/api/products'
const API_KEY     = 'E760EA79-9AD5-4279-881E-C7A033721E13'

type EngholmProduct = {
  sku:           string
  gtin:          string
  nautiskVarenr: string
  grouping:      string
  title:         string
  description:   string
  unit:          string
  stock:         number
  retail:        number
  price:         number
  lastUpdate:    string
  category:      string
  image:         string
  details:       Record<string, string>
}

export type EngholmImportProgress = {
  stage:         'fetching' | 'importing' | 'done' | 'error'
  total:         number
  processed:     number
  matched:       number  // tilknyttet eksisterende produkt
  staged:        number  // lagt i staging til gennemgang
  updated:       number  // opdateret eksisterende product_supplier
  errors:        number
  message:       string
}

type ProgressCallback = (p: EngholmImportProgress) => void

// Decode HTML entities (&#229; → å osv.)
function decode(str: string): string {
  if (!str) return ''
  return str
    .replace(/&#229;/g, 'å').replace(/&#230;/g, 'æ').replace(/&#248;/g, 'ø')
    .replace(/&#197;/g, 'Å').replace(/&#198;/g, 'Æ').replace(/&#216;/g, 'Ø')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .trim()
}

function decodeDetails(details: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(details ?? {})) out[decode(k)] = decode(String(v))
  return out
}

function parseCategories(cat: string): string[] {
  if (!cat) return []
  return cat.split('>').map(c => c.trim()).filter(Boolean)
}

// ── Fuzzy match mod eksisterende produkter via pg_trgm ──
async function findFuzzyMatches(
  supabase: ReturnType<typeof createServiceClient>,
  name: string,
  ean: string | null,
): Promise<{ product_id: string; product_name: string; score: number; match_field: string }[]> {
  const suggestions: { product_id: string; product_name: string; score: number; match_field: string }[] = []

  // Eksakt EAN-match (høj tillid)
  if (ean) {
    const { data } = await supabase
      .from('products')
      .select('id, name')
      .eq('ean', ean)
      .limit(1)
    if (data && data.length > 0) {
      suggestions.push({ product_id: data[0].id, product_name: data[0].name, score: 1.0, match_field: 'ean' })
      return suggestions // EAN-match er definitivt — ingen grund til fuzzy
    }
  }

  // Fuzzy navn-match via PostgreSQL trigram similarity
  // Kræver pg_trgm extension + idx_products_name_trgm index (migration 002)
  const { data: fuzzy } = await supabase.rpc('fuzzy_product_search', { search_name: name, min_score: 0.35 })

  if (fuzzy && fuzzy.length > 0) {
    for (const row of fuzzy.slice(0, 5)) {
      suggestions.push({
        product_id:   row.id,
        product_name: row.name,
        score:        parseFloat(row.score),
        match_field:  'name',
      })
    }
  }

  return suggestions
}

export async function importEngholm(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  onProgress({
    stage: 'fetching', total: 0, processed: 0, matched: 0, staged: 0, updated: 0, errors: 0,
    message: 'Henter produkter fra Engholm API...',
  })

  // ── 1. Hent alle produkter fra Engholm ──
  const resp = await fetch(API_URL, {
    headers: { 'ApiKey': API_KEY },
    signal:  AbortSignal.timeout(60_000),
  })
  if (!resp.ok) throw new Error(`Engholm API fejl: ${resp.status}`)

  const json = await resp.json() as { success: boolean; products: EngholmProduct[] }
  if (!json.success) throw new Error('Engholm API returnerede success: false')

  let products = json.products
  if (options.limit) products = products.slice(0, options.limit)

  const total = products.length
  onProgress({
    stage: 'importing', total, processed: 0, matched: 0, staged: 0, updated: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} produkter hentet — starter matching...`,
  })

  // ── 2. Hent eksisterende product_suppliers for Engholm (til priority-bevarelse) ──
  const existingSupplierRows: { id: string; supplier_sku: string; product_id: string; priority: number }[] = []
  for (let p = 0; ; p++) {
    const { data } = await supabase.from('product_suppliers')
      .select('id, supplier_sku, product_id, priority')
      .eq('supplier_id', SUPPLIER_ID)
      .range(p * 1000, p * 1000 + 999)
    if (!data || data.length === 0) break
    existingSupplierRows.push(...data)
    if (data.length < 1000) break
  }

  const existingBySku = Object.fromEntries(
    existingSupplierRows.map(r => [r.supplier_sku, r])
  )

  // ── 3. Hent eksisterende staging-rækker (til idempotens) ──
  const existingStagingRows: { id: string; normalized_sku: string; status: string }[] = []
  for (let p = 0; ; p++) {
    const { data } = await supabase.from('supplier_product_staging')
      .select('id, normalized_sku, status')
      .eq('supplier_id', SUPPLIER_ID)
      .range(p * 1000, p * 1000 + 999)
    if (!data || data.length === 0) break
    existingStagingRows.push(...data)
    if (data.length < 1000) break
  }

  const existingStaging = Object.fromEntries(
    existingStagingRows.map(r => [r.normalized_sku, r])
  )

  // ── 4. Importer i batches ──
  const BATCH = 100
  const importStart = new Date()
  let processed = 0, matched = 0, staged = 0, updated = 0, errors = 0

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)

    // Hent Supabase-produkter via EAN for hele batchen på én gang
    const gtins = batch.map(p => p.gtin).filter(Boolean)
    const { data: byEan } = gtins.length > 0
      ? await supabase.from('products').select('id, name, ean').in('ean', gtins)
      : { data: [] }

    const productByEan = Object.fromEntries(
      (byEan ?? []).filter(p => p.ean).map(p => [p.ean, p])
    )

    const ops: Promise<void>[] = []

    for (const p of batch) {
      const decodedTitle   = decode(p.title)
      const decodedDetails = decodeDetails(p.details)
      const { unit, unit_size } = resolveUnit(p.unit, decodedDetails)

      const supplierData = {
        supplier_id:             SUPPLIER_ID,
        supplier_sku:            p.sku,
        supplier_product_name:   decodedTitle,
        purchase_price:          p.price  > 0 ? p.price  : null,
        recommended_sales_price: p.retail > 0 ? p.retail : null,
        supplier_stock_quantity: p.stock  ?? 0,
        supplier_stock_reserved: 0,
        item_status:             (p.stock ?? 0) > 0 ? 'active' : 'out_of_stock',
        supplier_images:         p.image ? [{ url: p.image, alt: decodedTitle, is_primary: true }] : [],
        extra_data: {
          gtin:          p.gtin          || null,
          nautiskVarenr: p.nautiskVarenr || null,
          grouping:      p.grouping      || null,
          unit_raw:      p.unit          || null,
          unit_normalized: unit,
          unit_size,
          description:   decode(p.description || ''),
          category:      decode(p.category    || ''),
          categories:    parseCategories(decode(p.category || '')),
          lastUpdate:    p.lastUpdate     || null,
          details:       decodedDetails,
        },
        variant_id: null,
        is_active:  true,
      }

      // ── Forsøg hård EAN-match ──
      const matchedProduct = productByEan[p.gtin] ?? null

      processed++

      if (matchedProduct) {
        // MATCH FUNDET — opdater/opret product_suppliers
        const existing = existingBySku[p.sku]

        if (existing) {
          // Bevar priority (intern indstilling) — overskriv ALT andet
          updated++
          ops.push(Promise.resolve(
            supabase.from('product_suppliers').update({ ...supplierData, priority: existing.priority }).eq('id', existing.id)
          ).then(({ error }) => { if (error) { console.error(`[engholm] update ps sku=${p.sku}:`, error.message, error.details); errors++; updated-- } }))
        } else {
          // Ny tilknytning — sæt priority til 1 som default
          matched++
          ops.push(Promise.resolve(
            supabase.from('product_suppliers').insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
          ).then(({ error }) => { if (error) { console.error(`[engholm] insert ps sku=${p.sku}:`, error.message, error.details); errors++; matched-- } }))
        }
      } else {
        // INGEN HÅRD MATCH — send til staging
        const stagingRow = existingStaging[p.sku]
        if (stagingRow && stagingRow.status !== 'pending_review') {
          // Allerede behandlet manuelt — opdater kun rådata, rør ikke status
          ops.push(Promise.resolve(
            supabase.from('supplier_product_staging')
              .update({ raw_data: supplierData.extra_data, normalized_unit: unit, normalized_unit_size: unit_size })
              .eq('id', stagingRow.id)
          ).then(({ error }) => { if (error) { console.error(`[engholm] update staging (skipped) sku=${p.sku}:`, error.message, error.details); errors++ } }))
        } else {
          // Fuzzy match-forslag (simpel variant — fuld pg_trgm bruges i API-ruten)
          // Her gemmer vi bare raw_data og lader UI'en kalde fuzzy search bagefter
          const stagingUpsertRow = {
            supplier_id:         SUPPLIER_ID,
            raw_data: {
              ...supplierData.extra_data,
              supplier_sku:            p.sku,
              supplier_product_name:   decodedTitle,
              purchase_price:          supplierData.purchase_price,
              recommended_sales_price: supplierData.recommended_sales_price,
              supplier_stock_quantity: supplierData.supplier_stock_quantity,
              supplier_images:         supplierData.supplier_images,
            },
            normalized_name:      decodedTitle,
            normalized_ean:       p.gtin  || null,
            normalized_sku:       p.sku,
            normalized_unit:      unit,
            normalized_unit_size: unit_size,
            match_suggestions:    [],  // udfyldes af baggrundsjob / on-demand
            status:               stagingRow ? stagingRow.status : 'pending_review',
            updated_at:           new Date().toISOString(),
          }

          staged++
          ops.push(Promise.resolve(
            stagingRow
              ? supabase.from('supplier_product_staging').update(stagingUpsertRow).eq('id', stagingRow.id)
              : supabase.from('supplier_product_staging').insert(stagingUpsertRow)
          ).then(({ error }) => { if (error) { console.error(`[engholm] upsert staging sku=${p.sku}:`, error.message, error.details); errors++; staged-- } }))
        }
      }
    }

    await Promise.all(ops)

    // Opdater last_synced_at for leverandøren
    await supabase
      .from('suppliers')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', SUPPLIER_ID)

    onProgress({
      stage: 'importing', total, processed, matched, staged, updated, errors,
      message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
    })
  }

  await flagRecentlyImportedForReview(SUPPLIER_ID, importStart, supabase)

  onProgress({
    stage: 'done', total, processed, matched, staged, updated, errors,
    message: `Færdig! ${matched} matchet · ${updated} opdateret · ${staged} afventer gennemgang · ${errors} fejl`,
  })
}
