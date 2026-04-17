import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'
import { flagRecentlyImportedForReview } from '@/lib/review-checker'

export type HfIndustriImportProgress = {
  stage:     'parsing' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  matched:   number
  staged:    number
  updated:   number
  errors:    number
  message:   string
}

type ProgressCallback = (p: HfIndustriImportProgress) => void

type HfRow = {
  varenummer: string
  varenavn:   string
  enhed:      string | null
  vejlPris:   number | null  // Vejl. Ud ex. m
  indkoeb:    number | null  // Indkøb ex. m
  ean:        string | null
  category:   string         // sheet name
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  // Dansk talformat: "1.234,56" → 1234.56
  const s = String(val).trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function normalizeEan(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  // XLSX læser EAN som float (5710996990005.0) — konverter via parseInt for at fjerne decimaler
  if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return null
    return String(Math.round(val))
  }
  const s = String(val).trim()
  if (!s || s === '0') return null
  // Fjern eventuelle decimaler fra string-form ("5710996990005.0")
  return s.replace(/\.0+$/, '')
}

// Fuzzy kolonne-opslag: normaliser headers ved at lowercase + fjern tegnsætning + whitespace
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-zæøå0-9]/g, '')
}

// Kandidat-mønstre for pris-kolonner (vejledende udsalgspris)
const VEJL_PATTERNS = ['vejludexm', 'vejludexm', 'vejlpris']
// Kandidat-mønstre for indkøbspris
const INDKOEB_PATTERNS = ['indkøbexm', 'indkobexm', 'indkoebexm', 'indkøb']

function findColumn(keys: string[], patterns: string[]): string | undefined {
  // Foretrukken: eksakt match på normaliseret header
  return keys.find(k => patterns.some(p => normalizeHeader(k).startsWith(p)))
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): HfRow[] {
  // Prøv at finde den rigtige header-række — ark som Alexseal har en note-række øverst.
  // XLSX sheet_to_json springer automatisk over rækker uden en 'Varenummer'-kolonne når vi
  // bruger header:1, men vi skal finde den første række der indeholder 'Varenummer'.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  // Find den første række der indeholder 'Varenummer'
  let headerRowIdx = -1
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i] as unknown[]
    if (row.some(cell => typeof cell === 'string' && cell.trim().toLowerCase() === 'varenummer')) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) return []  // Intet gyldigt ark-layout fundet

  const headers = (aoa[headerRowIdx] as unknown[]).map(h => String(h ?? ''))
  const allKeys = headers

  // Find kolonneindeks for de relevante felter
  const idxOf = (name: string) => headers.findIndex(h => h.trim().toLowerCase() === name.toLowerCase())
  const varenummerIdx = idxOf('Varenummer')
  const varenavnIdx   = idxOf('Varenavn')
  const enhedIdx      = idxOf('Enhed')
  const eanIdx        = idxOf('EAN-nummer')

  // Fuzzy match på pris-kolonner
  const vejlKey    = findColumn(allKeys, VEJL_PATTERNS)
  const indkoebKey = findColumn(allKeys, INDKOEB_PATTERNS)
  const vejlIdx    = vejlKey    !== undefined ? headers.indexOf(vejlKey)    : -1
  const indkoebIdx = indkoebKey !== undefined ? headers.indexOf(indkoebKey) : -1

  const rows: HfRow[] = []

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[]
    const varenummer = String(row[varenummerIdx] ?? '').trim()
    if (!varenummer) continue  // Skip tomme rækker og sektionsoverskrifter

    rows.push({
      varenummer,
      varenavn: String(row[varenavnIdx] ?? '').trim(),
      enhed:    enhedIdx >= 0 ? (String(row[enhedIdx] ?? '').trim() || null) : null,
      vejlPris: vejlIdx    >= 0 ? parseNumber(row[vejlIdx])    : null,
      indkoeb:  indkoebIdx >= 0 ? parseNumber(row[indkoebIdx]) : null,
      ean:      eanIdx >= 0 ? normalizeEan(row[eanIdx]) : null,
      category: sheetName,
    })
  }

  return rows
}

export async function importHfIndustri(
  fileBuffer: Buffer,
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  // Hent leverandør-ID
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'HF Industri Marine')
    .single()

  if (supErr || !supplier) throw new Error(`HF Industri Marine leverandør ikke fundet: ${supErr?.message}`)
  const SUPPLIER_ID = supplier.id as string

  onProgress({
    stage: 'parsing', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, errors: 0,
    message: 'Parser XLSX-fil...',
  })

  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })

  let allRows: HfRow[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = parseSheet(sheet, sheetName)
    allRows = allRows.concat(rows)
  }

  if (options.limit) allRows = allRows.slice(0, options.limit)

  const total = allRows.length

  onProgress({
    stage: 'importing', total, processed: 0, matched: 0,
    staged: 0, updated: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} produkter fundet på tværs af ${workbook.SheetNames.length} ark — starter matching...`,
  })

  // Hent eksisterende product_suppliers for HF Industri
  const existingSpRows: { id: string; supplier_sku: string; product_id: string; priority: number }[] = []
  for (let p = 0; ; p++) {
    const { data } = await supabase.from('product_suppliers')
      .select('id, supplier_sku, product_id, priority')
      .eq('supplier_id', SUPPLIER_ID)
      .range(p * 1000, p * 1000 + 999)
    if (!data || data.length === 0) break
    existingSpRows.push(...data)
    if (data.length < 1000) break
  }

  const existingBySku = Object.fromEntries(
    existingSpRows.map(r => [r.supplier_sku, r])
  )

  // Hent eksisterende staging-rækker
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

  const BATCH = 100
  const importStart = new Date()
  let processed = 0, matched = 0, staged = 0, updated = 0, errors = 0

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)

    // Batch EAN-opslag
    const eans = batch.map(p => p.ean).filter((e): e is string => !!e)
    const { data: byEan } = eans.length > 0
      ? await supabase.from('products').select('id, ean, categories').in('ean', eans)
      : { data: [] }

    const productByEan = Object.fromEntries(
      (byEan ?? []).filter(p => p.ean).map(p => [p.ean, p])
    )

    const ops: Promise<void>[] = []

    for (const p of batch) {
      const supplierData = {
        supplier_id:             SUPPLIER_ID,
        supplier_sku:            p.varenummer,
        supplier_product_name:   p.varenavn,
        purchase_price:          p.indkoeb,
        recommended_sales_price: p.vejlPris,
        extra_data: {
          category: p.category,
          enhed:    p.enhed,
          ean:      p.ean,
        },
        variant_id: null,
        is_active:  true,
      }

      const matchedProduct = p.ean ? (productByEan[p.ean] ?? null) : null

      processed++

      if (matchedProduct) {
        const existing = existingBySku[p.varenummer]

        if (existing) {
          updated++
          ops.push(Promise.resolve(
            supabase.from('product_suppliers').update({ ...supplierData, priority: existing.priority }).eq('id', existing.id)
          ).then(({ error }) => { if (error) { errors++; updated-- } }))
        } else {
          matched++
          ops.push(Promise.resolve(
            supabase.from('product_suppliers').insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
          ).then(({ error }) => { if (error) { errors++; matched-- } }))
        }

        // Tilføj sheet-navn som kategori på produktet hvis det ikke allerede er der
        const existingCats: string[] = matchedProduct.categories ?? []
        if (!existingCats.includes(p.category)) {
          ops.push(Promise.resolve(
            supabase.from('products').update({ categories: [...existingCats, p.category] }).eq('id', matchedProduct.id)
          ).then(({ error }) => { if (error) errors++ }))
        }
      } else {
        // Ingen match → staging
        const stagingRow = existingStaging[p.varenummer]

        if (stagingRow && stagingRow.status !== 'pending_review') {
          // Allerede behandlet — opdater kun rådata
          ops.push(Promise.resolve(
            supabase.from('supplier_product_staging')
              .update({
                raw_data:   { ...supplierData.extra_data, supplier_sku: p.varenummer, supplier_product_name: p.varenavn, purchase_price: p.indkoeb, recommended_sales_price: p.vejlPris },
                updated_at: new Date().toISOString(),
              })
              .eq('id', stagingRow.id)
          ).then(({ error }) => { if (error) errors++ }))
        } else {
          const stagingUpsertRow = {
            supplier_id: SUPPLIER_ID,
            raw_data: {
              supplier_sku:            p.varenummer,
              supplier_product_name:   p.varenavn,
              purchase_price:          p.indkoeb,
              recommended_sales_price: p.vejlPris,
              enhed:                   p.enhed,
              ean:                     p.ean,
              categories:              [p.category],
            },
            normalized_name:      p.varenavn,
            normalized_ean:       p.ean,
            normalized_sku:       p.varenummer,
            normalized_unit:      p.enhed,
            normalized_unit_size: null,
            match_suggestions:    [],
            status:               stagingRow ? stagingRow.status : 'pending_review',
            updated_at:           new Date().toISOString(),
          }

          staged++
          ops.push(Promise.resolve(
            stagingRow
              ? supabase.from('supplier_product_staging').update(stagingUpsertRow).eq('id', stagingRow.id)
              : supabase.from('supplier_product_staging').insert(stagingUpsertRow)
          ).then(({ error }) => { if (error) { errors++; staged-- } }))
        }
      }
    }

    await Promise.all(ops)

    // Opdater last_synced_at løbende
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
