import { createServiceClient } from '@/lib/supabase/server'

const API_URL = 'https://scanmarine.dk/api/produkter'

type ScanmarineProduct = {
  product_number:   string
  product_name:     string
  product_price:    number | null   // dansk format: "355,00" → 355
  product_s_desc:   string
  product_desc:     string
  product_photo:    string
  product_discount: number | null
  ean_number:       string
  weight:           number | null
  stock:            number
}

export type ScanmarineImportProgress = {
  stage:     'fetching' | 'parsing' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  matched:   number
  staged:    number
  updated:   number
  errors:    number
  message:   string
}

type ProgressCallback = (p: ScanmarineImportProgress) => void

// Dansk talformat → number: "355,00" → 355, "1.234,56" → 1234.56
function parseDanishNumber(val: string): number | null {
  if (!val || val.trim() === '') return null
  const cleaned = val.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// Parse semikolon-separeret CSV med multi-linje felter i anførselstegn
function parseCsv(text: string): ScanmarineProduct[] {
  const results: ScanmarineProduct[] = []

  // Fjern Windows line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Manuel CSV-parser der håndterer quoted multi-linje felter
  let pos = 0
  const len = normalized.length

  function readField(): string {
    if (pos >= len) return ''

    if (normalized[pos] === '"') {
      // Quoted field
      pos++ // skip opening quote
      let field = ''
      while (pos < len) {
        if (normalized[pos] === '"') {
          if (normalized[pos + 1] === '"') {
            // Escaped quote
            field += '"'
            pos += 2
          } else {
            // End of quoted field
            pos++ // skip closing quote
            break
          }
        } else {
          field += normalized[pos]
          pos++
        }
      }
      return field
    } else {
      // Unquoted field — læs til ; eller newline
      let field = ''
      while (pos < len && normalized[pos] !== ';' && normalized[pos] !== '\n') {
        field += normalized[pos]
        pos++
      }
      return field
    }
  }

  function readRow(): string[] | null {
    if (pos >= len) return null
    const fields: string[] = []
    while (pos < len) {
      fields.push(readField())
      if (pos < len && normalized[pos] === ';') {
        pos++ // skip separator
      } else {
        // Newline eller end of file
        if (pos < len && normalized[pos] === '\n') pos++
        break
      }
    }
    return fields.length > 0 ? fields : null
  }

  // Læs header-række
  const header = readRow()
  if (!header) return results

  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h.trim()] = i })

  // Læs data-rækker
  while (pos < len) {
    // Skip tomme linjer
    if (normalized[pos] === '\n') { pos++; continue }

    const row = readRow()
    if (!row || row.length < 2) continue

    const get = (key: string) => (row[idx[key]] ?? '').trim()

    const ean = get('ean_number')
    const sku = get('product_number')
    if (!sku) continue  // Skip rækker uden varenummer

    results.push({
      product_number:   sku,
      product_name:     get('product_name'),
      product_price:    parseDanishNumber(get('product_price')),
      product_s_desc:   get('product_s_desc'),
      product_desc:     get('product_desc'),
      product_photo:    get('product_photo'),
      product_discount: parseDanishNumber(get('product_discount')),
      ean_number:       ean,
      weight:           parseDanishNumber(get('weight')),
      stock:            parseInt(get('stock') || '0', 10) || 0,
    })
  }

  return results
}

export async function importScanmarine(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  // Hent leverandør-ID
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'Scanmarine')
    .single()

  if (supErr || !supplier) throw new Error(`Scanmarine leverandør ikke fundet: ${supErr?.message}`)
  const SUPPLIER_ID = supplier.id as string

  onProgress({
    stage: 'fetching', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, errors: 0,
    message: 'Henter CSV fra Scanmarine...',
  })

  const resp = await fetch(API_URL, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`Scanmarine HTTP fejl: ${resp.status}`)

  const csvText = await resp.text()

  onProgress({
    stage: 'parsing', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, errors: 0,
    message: 'Parser CSV...',
  })

  let products = parseCsv(csvText)
  if (options.limit) products = products.slice(0, options.limit)

  const total = products.length

  onProgress({
    stage: 'importing', total, processed: 0, matched: 0,
    staged: 0, updated: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} produkter fundet — starter matching...`,
  })

  // Hent eksisterende product_suppliers for Scanmarine
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
  let processed = 0, matched = 0, staged = 0, updated = 0, errors = 0

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)

    // Batch EAN-opslag
    const eans = batch.map(p => p.ean_number).filter(Boolean)
    const { data: byEan } = eans.length > 0
      ? await supabase.from('products').select('id, name, ean').in('ean', eans)
      : { data: [] }

    const productByEan = Object.fromEntries(
      (byEan ?? []).filter(p => p.ean).map(p => [p.ean, p])
    )

    for (const p of batch) {
      const ean    = p.ean_number || null
      const images = p.product_photo
        ? [{ url: p.product_photo, alt: p.product_name, is_primary: true }]
        : []

      const supplierData = {
        supplier_id:             SUPPLIER_ID,
        supplier_sku:            p.product_number,
        supplier_product_name:   p.product_name,
        purchase_price:          null,                   // Scanmarine opgiver ikke indkøbspris
        recommended_sales_price: p.product_price,
        supplier_stock_quantity: p.stock,
        supplier_stock_reserved: 0,
        item_status:             p.stock > 0 ? 'active' : 'out_of_stock',
        supplier_images:         images,
        extra_data: {
          ean,
          short_description: p.product_s_desc || null,
          description:       p.product_desc   || null,
          weight:            p.weight,
          discount:          p.product_discount,
        },
        variant_id: null,
        is_active:  true,
      }

      const matchedProduct = ean ? (productByEan[ean] ?? null) : null

      if (matchedProduct) {
        const existing = existingBySku[p.product_number]

        if (existing) {
          await supabase
            .from('product_suppliers')
            .update({ ...supplierData, priority: existing.priority })
            .eq('id', existing.id)
          updated++
        } else {
          const { error } = await supabase
            .from('product_suppliers')
            .insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
          if (error) errors++; else matched++
        }
      } else {
        // Ingen match → staging
        const stagingRow = existingStaging[p.product_number]

        if (stagingRow && stagingRow.status !== 'pending_review') {
          // Allerede behandlet — opdater kun rådata
          await supabase
            .from('supplier_product_staging')
            .update({ raw_data: supplierData.extra_data, updated_at: new Date().toISOString() })
            .eq('id', stagingRow.id)
          processed++
          continue
        }

        const stagingUpsertRow = {
          supplier_id:          SUPPLIER_ID,
          raw_data: {
            ...supplierData.extra_data,
            supplier_sku:            p.product_number,
            supplier_product_name:   p.product_name,
            purchase_price:          null,
            recommended_sales_price: p.product_price,
            supplier_stock_quantity: p.stock,
            supplier_images:         images,
          },
          normalized_name:      p.product_name,
          normalized_ean:       ean,
          normalized_sku:       p.product_number,
          normalized_unit:      null,
          normalized_unit_size: null,
          match_suggestions:    [],
          status:               stagingRow ? stagingRow.status : 'pending_review',
          updated_at:           new Date().toISOString(),
        }

        const { error } = stagingRow
          ? await supabase.from('supplier_product_staging').update(stagingUpsertRow).eq('id', stagingRow.id)
          : await supabase.from('supplier_product_staging').insert(stagingUpsertRow)

        if (error) errors++; else staged++
      }

      processed++
    }

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

  onProgress({
    stage: 'done', total, processed, matched, staged, updated, errors,
    message: `Færdig! ${matched} matchet · ${updated} opdateret · ${staged} afventer gennemgang · ${errors} fejl`,
  })
}
