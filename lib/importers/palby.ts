import { createServiceClient } from '@/lib/supabase/server'
import { XMLParser } from 'fast-xml-parser'
import { flagRecentlyImportedForReview } from '@/lib/review-checker'
import * as ftp from 'basic-ftp'
import { Writable } from 'stream'
import { syncImagesToProduct } from './image-sync'
import { enrichMatchedProduct } from './product-enrichment'
import { batchEanLookup, type EanMatch } from './ean-lookup'

// Palby FTP fil-stier
const FILES = {
  productFull:      '/webcataloginventitems_flat_da_full.csv',
  stockFull:        '/web_stockstatus_newitemid.xml',
  stockDeltaDir:    '/delta/',
  stockDeltaPrefix: 'web_stockstatus_newitemid_delta_',
}

// Felt-indeks i CSV-headeren (0-baseret, sættes ved parsning)
type CsvFieldMap = Record<string, number>

type PalbyProduct = {
  ItemId:                   string
  SalesPrice:               string   // indkøbspris til forhandler
  RecommendedRetailPrice:   string   // vejledende salgspris
  Currency:                 string
  Productname:              string
  ImageUrls:                string   // space-separerede URLs
  Barcode:                  string   // EAN
  Caption:                  string
  ShortDescription:         string
  LongDescription:          string
  GrossWeight:              string
  GrossHeight:              string
  GrossWidth:               string
  GrossDepth:               string
  CatalogElementType:       string   // 'Single' | 'Master'
  MasterItemId:             string
  VariantName:              string
  DropshippingNotPossible:  string
  CatalogNodeIds:           string
  // Producentens eget varenummer (felt-navn varierer — prøver flere kendte navne)
  ManufacturerItemId:       string   // f.eks. "29097-1000" for Jabsco
  ProducerItemId:           string
  OriginalItemId:           string
  SupplierItemId:           string
}

type StockRow = {
  ItemId:              string
  OnHandAvailPhysical: number
  ItemBarcode:         string
  InStockConfirmed:    string
  InStockBestGuess:    string
}

export type PalbyImportProgress = {
  stage:    'connecting' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error'
  total:    number
  processed: number
  matched:  number
  staged:   number
  updated:  number
  skipped:  number
  errors:   number
  message:  string
}

type ProgressCallback = (p: PalbyImportProgress) => void

type SupplierRow = {
  id:           string
  ftp_host:     string
  ftp_port:     number
  ftp_user:     string
  ftp_password: string
  sync_state:   Record<string, string>
}

// ── FTP helpers ──────────────────────────────────────────────

async function ftpConnect(s: SupplierRow): Promise<ftp.Client> {
  const client = new ftp.Client()
  client.ftp.verbose = false
  await client.access({
    host:     s.ftp_host,
    port:     s.ftp_port || 21,
    user:     s.ftp_user,
    password: s.ftp_password,
    secure:   false,
  })
  return client
}

async function downloadFile(client: ftp.Client, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  const writable = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) { chunks.push(chunk); cb() },
  })
  await client.downloadTo(writable, remotePath)
  return Buffer.concat(chunks)
}

async function listDeltaFiles(client: ftp.Client, dir: string, prefix: string): Promise<string[]> {
  const entries = await client.list(dir)
  return entries
    .filter(e => e.type === ftp.FileType.File && e.name.startsWith(prefix) && e.name.endsWith('.xml'))
    .map(e => e.name)
    .sort()
}

function parseDeltaTimestamp(filename: string, prefix: string): string {
  return filename.replace(prefix, '').replace('.xml', '')
}

// ── CSV parser (Windows-1252, komma-separeret, dobbelte anførselstegn) ──

function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuote = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

function parsePalbyProductCsv(buf: Buffer): PalbyProduct[] {
  // Palby CSV er Windows-1252 encoded
  const text  = new TextDecoder('windows-1252').decode(buf)
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''))

  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0])
  const fieldMap: CsvFieldMap = {}
  headers.forEach((h, i) => { fieldMap[h.trim()] = i })

  const get = (row: string[], field: string): string =>
    row[fieldMap[field] ?? -1]?.trim() ?? ''

  const products: PalbyProduct[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const row = parseCsvRow(lines[i])

    const p: PalbyProduct = {
      ItemId:                  get(row, 'ItemId'),
      SalesPrice:              get(row, 'SalesPrice'),
      RecommendedRetailPrice:  get(row, 'RecommendedRetailPrice'),
      Currency:                get(row, 'Currency'),
      Productname:             get(row, 'Productname'),
      ImageUrls:               get(row, 'ImageUrls'),
      Barcode:                 get(row, 'Barcode'),
      Caption:                 get(row, 'Caption'),
      ShortDescription:        get(row, 'ShortDescription'),
      LongDescription:         get(row, 'LongDescription'),
      GrossWeight:             get(row, 'GrossWeight'),
      GrossHeight:             get(row, 'GrossHeight'),
      GrossWidth:              get(row, 'GrossWidth'),
      GrossDepth:              get(row, 'GrossDepth'),
      CatalogElementType:      get(row, 'CatalogElementType'),
      MasterItemId:            get(row, 'MasterItemId'),
      VariantName:             get(row, 'VariantName'),
      DropshippingNotPossible: get(row, 'DropshippingNotPossible'),
      CatalogNodeIds:          get(row, 'CatalogNodeIds'),
      // Producentens varenummer — prøver alle kendte feltnavne
      ManufacturerItemId:      get(row, 'ManufacturerItemId'),
      ProducerItemId:          get(row, 'ProducerItemId'),
      OriginalItemId:          get(row, 'OriginalItemId'),
      SupplierItemId:          get(row, 'SupplierItemId'),
    }

    if (p.ItemId) products.push(p)
  }

  return products
}

function parseImages(p: PalbyProduct): Array<{ url: string; alt: string; is_primary: boolean }> {
  if (!p.ImageUrls) return []
  const urls = p.ImageUrls.split(' ').map(u => u.trim()).filter(Boolean)
  return urls.map((url, idx) => ({
    url,
    alt:        p.Caption || p.Productname,
    is_primary: idx === 0,
  }))
}

function parseNumber(val: string): number | null {
  if (!val) return null
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? null : n
}

// ── XML parser (bruges til lager-XML) ────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes:    false,
  parseTagValue:       true,
  parseAttributeValue: true,
  isArray: (name) => ['InventTable'].includes(name),
})

function parseStockXml(buf: Buffer): StockRow[] {
  const parsed = XML_PARSER.parse(buf.toString('utf-8'))
  return parsed?.Export?.Service?.Body?.InventTable ?? []
}

// ── Produktimport ────────────────────────────────────────────

export async function importPalby(
  onProgress: ProgressCallback,
  options: { limit?: number; delta?: boolean } = {}
): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, sync_state')
    .eq('name', 'Palby')
    .single()

  if (supErr || !supplier) throw new Error(`Palby ikke fundet: ${supErr?.message}`)
  if (!supplier.ftp_host) throw new Error('Palby FTP-legitimationsoplysninger mangler')

  const s           = supplier as SupplierRow
  const SUPPLIER_ID = s.id

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Palby FTP...',
  })

  const client = await ftpConnect(s)

  try {
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `Henter produktfil fra Palby FTP (${FILES.productFull})...`,
    })

    const csvBuf = await downloadFile(client, FILES.productFull)

    onProgress({
      stage: 'parsing', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Parser CSV...',
    })

    // Filtrer: kun Single-produkter (ikke Master/variant-grupperinger)
    let products = parsePalbyProductCsv(csvBuf)
      .filter(p => p.CatalogElementType === 'Single')

    if (options.limit) products = products.slice(0, options.limit)

    const total = products.length

    onProgress({
      stage: 'importing', total, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `${total.toLocaleString('da-DK')} Single-produkter — starter matching...`,
    })

    // Hent eksisterende product_suppliers og staging
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
    const existingBySku = Object.fromEntries(existingSpRows.map(r => [r.supplier_sku, r]))

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
    const existingStaging = Object.fromEntries(existingStagingRows.map(r => [r.normalized_sku, r]))

    const BATCH = 100
    const importStart = new Date()
    let processed = 0, matched = 0, staged = 0, updated = 0, skipped = 0, errors = 0
    const errorLog: string[] = []

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH)

      const eans = batch.map(p => p.Barcode).filter(Boolean)
      const productByEan = await batchEanLookup(supabase, eans, SUPPLIER_ID)

      const ops: Promise<void>[] = []

      for (const p of batch) {
        const ean    = p.Barcode || null
        const images = parseImages(p)
        const skuStr = p.ItemId

        // Producentens eget varenummer — hent det første der er udfyldt
        const manufacturerSku =
          p.ManufacturerItemId || p.ProducerItemId || p.OriginalItemId || p.SupplierItemId || null

        // Variant-attributter fra Palby feed
        const variantAttributes: Array<{ name: string; value: string }> = []
        if (p.VariantName) variantAttributes.push({ name: 'Variant', value: p.VariantName })

        const supplierData = {
          supplier_id:             SUPPLIER_ID,
          supplier_sku:            skuStr,
          supplier_product_name:   p.Caption || p.Productname,
          purchase_price:          parseNumber(p.SalesPrice),
          recommended_sales_price: parseNumber(p.RecommendedRetailPrice),
          supplier_stock_quantity: 0,
          supplier_stock_reserved: 0,
          item_status:             'active',
          moq:                     1,
          supplier_images:         images,
          // Nye dedikerede kolonner
          manufacturer_sku:        manufacturerSku,
          supplier_parent_sku:     p.MasterItemId || null,
          supplier_variant_attributes: variantAttributes.length > 0 ? variantAttributes : null,
          extra_data: {
            productname:               p.Productname,
            short_description:         p.ShortDescription || null,
            description:               p.LongDescription  || null,
            ean,
            weight:                    parseNumber(p.GrossWeight),
            height:                    parseNumber(p.GrossHeight),
            width:                     parseNumber(p.GrossWidth),
            depth:                     parseNumber(p.GrossDepth),
            currency:                  p.Currency         || null,
            catalog_element_type:      p.CatalogElementType,
            dropshipping_not_possible: p.DropshippingNotPossible === 'true',
            catalog_node_ids:          p.CatalogNodeIds   || null,
          },
          variant_id: null,
          is_active:  true,
        }

        const match = ean ? (productByEan[ean] ?? null) : null
        processed++

        if (match) {
          const existing = existingBySku[skuStr]
          const enrichData = {
            dimensions:      { weight: parseNumber(p.GrossWeight), height: parseNumber(p.GrossHeight), width: parseNumber(p.GrossWidth), length: parseNumber(p.GrossDepth) },
            descriptions:    { description: p.LongDescription || null, short_description: p.ShortDescription || null },
            manufacturerSku: manufacturerSku,
            variantAttributes,
          }

          if (existing) {
            updated++
            ops.push(Promise.resolve(
              supabase.from('product_suppliers')
                .update({ ...supplierData, priority: existing.priority })
                .eq('id', existing.id)
            ).then(async ({ error }) => {
              if (error) { errors++; updated--; return }
              await Promise.all([
                images.length > 0 ? syncImagesToProduct(match.productId, images, 'palby', supabase) : Promise.resolve(),
                enrichMatchedProduct(match.productId, enrichData, supabase),
              ])
              const sRow = existingStaging[skuStr]
              if (sRow && ['pending_review', 'needs_review'].includes(sRow.status)) {
                await supabase.from('supplier_product_staging')
                  .update({ status: 'matched', matched_product_id: match.productId, updated_at: new Date().toISOString() })
                  .eq('id', sRow.id)
              }
            }))
          } else {
            matched++
            ops.push(Promise.resolve(
              supabase.from('product_suppliers')
                .insert({ ...supplierData, product_id: match.productId, variant_id: match.variantId, priority: 1 })
            ).then(async ({ error }) => {
              if (error) { errors++; matched--; return }
              await Promise.all([
                images.length > 0 ? syncImagesToProduct(match.productId, images, 'palby', supabase) : Promise.resolve(),
                enrichMatchedProduct(match.productId, enrichData, supabase),
              ])
              const sRow = existingStaging[skuStr]
              if (sRow && ['pending_review', 'needs_review'].includes(sRow.status)) {
                await supabase.from('supplier_product_staging')
                  .update({ status: 'matched', matched_product_id: match.productId, updated_at: new Date().toISOString() })
                  .eq('id', sRow.id)
              }
            }))
          }
        } else {
          const stagingRow = existingStaging[skuStr]
          const rawData = {
            supplier_sku:              skuStr,
            supplier_product_name:     supplierData.supplier_product_name,
            purchase_price:            supplierData.purchase_price,
            recommended_sales_price:   supplierData.recommended_sales_price,
            manufacturer_sku:          manufacturerSku,
            supplier_parent_sku:       p.MasterItemId || null,
            supplier_variant_attributes: variantAttributes.length > 0 ? variantAttributes : null,
            supplier_images:           images,
            short_description:         p.ShortDescription || null,
            description:               p.LongDescription  || null,
            weight:                    parseNumber(p.GrossWeight),
            height:                    parseNumber(p.GrossHeight),
            width:                     parseNumber(p.GrossWidth),
            depth:                     parseNumber(p.GrossDepth),
            catalog_node_ids:          p.CatalogNodeIds   || null,
            dropshipping_not_possible: p.DropshippingNotPossible === 'true',
          }

          if (stagingRow && stagingRow.status !== 'pending_review') {
            skipped++
            ops.push(Promise.resolve(
              supabase.from('supplier_product_staging')
                .update({ raw_data: rawData, updated_at: new Date().toISOString() })
                .eq('id', stagingRow.id)
            ).then(({ error }) => { if (error) { errors++; skipped-- } }))
          } else {
            const stagingUpsertRow = {
              supplier_id:          SUPPLIER_ID,
              raw_data:             rawData,
              normalized_name:      p.Caption || p.Productname,
              normalized_ean:       ean,
              normalized_sku:       skuStr,
              normalized_unit:      null,
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
            ).then(({ error }) => { if (error) { const msg = `staging sku=${skuStr}: ${error.message}`; console.error('[palby]', msg); errorLog.push(msg); errors++; staged-- } }))
          }
        }
      }

      await Promise.all(ops)

      onProgress({
        stage: 'importing', total, processed, matched, staged, updated, skipped, errors,
        message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
      })
    }

    const newSyncState = {
      ...(s.sync_state ?? {}),
      last_full_product_sync: new Date().toISOString(),
      last_import_errors: errorLog.slice(0, 500),
    }
    await supabase.from('suppliers')
      .update({ last_synced_at: new Date().toISOString(), sync_state: newSyncState })
      .eq('id', SUPPLIER_ID)

    await flagRecentlyImportedForReview(SUPPLIER_ID, importStart, supabase)

    onProgress({
      stage: 'done', total, processed, matched, staged, updated, skipped, errors,
      message: `Færdig! ${matched} matchet · ${updated} opdateret · ${staged} afventer gennemgang · ${errors} fejl`,
    })

  } finally {
    client.close()
  }
}

// ── Lagersync via delta-filer ────────────────────────────────
//
// Palby opdaterer delta-lagerfiler med timestampet filnavn:
//   web_stockstatus_newitemid_delta_<YYYYMMDDHHMMSS>.xml
// Fuld lagerfil: web_stockstatus_newitemid.xml (i roden)
// Delta-filer: /delta/web_stockstatus_newitemid_delta_*.xml

export async function syncPalbyStock(
  onProgress: ProgressCallback,
  options: { full?: boolean } = {}
): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, sync_state')
    .eq('name', 'Palby')
    .single()

  if (supErr || !supplier) throw new Error(`Palby ikke fundet: ${supErr?.message}`)
  if (!supplier.ftp_host) throw new Error('Palby FTP-legitimationsoplysninger mangler')

  const s           = supplier as SupplierRow
  const SUPPLIER_ID = s.id
  const syncState   = s.sync_state ?? {}

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Palby FTP...',
  })

  const client = await ftpConnect(s)

  try {
    const lastDeltaTs = syncState.last_stock_delta_ts ?? ''

    if (options.full || !lastDeltaTs) {
      onProgress({
        stage: 'downloading', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 0,
        message: 'Henter komplet lagerfil (fuld sync)...',
      })

      const buf  = await downloadFile(client, FILES.stockFull)
      const rows = parseStockXml(buf)
      const res  = await applyStockRows(rows, SUPPLIER_ID, supabase, onProgress)

      // Gem nyeste delta-timestamp som baseline
      const allDeltas = await listDeltaFiles(client, FILES.stockDeltaDir, FILES.stockDeltaPrefix)
      const newestTs  = allDeltas.length > 0
        ? parseDeltaTimestamp(allDeltas[allDeltas.length - 1], FILES.stockDeltaPrefix)
        : ''

      await supabase.from('suppliers').update({
        last_synced_at: new Date().toISOString(),
        sync_state: { ...syncState, last_stock_delta_ts: newestTs, last_full_stock_sync: new Date().toISOString() },
      }).eq('id', SUPPLIER_ID)

      onProgress({
        stage: 'done', total: rows.length, processed: rows.length,
        matched: 0, staged: 0, updated: res.updated, skipped: res.skipped, errors: res.errors,
        message: `Fuld lagersync færdig! ${res.updated} opdateret · ${res.errors} fejl`,
      })
      return
    }

    // Delta-kørsel
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Finder nye delta-lagerfiler på FTP...',
    })

    const allDeltas    = await listDeltaFiles(client, FILES.stockDeltaDir, FILES.stockDeltaPrefix)
    const filesToProcess = allDeltas.filter(f => {
      const ts = parseDeltaTimestamp(f, FILES.stockDeltaPrefix)
      return ts > lastDeltaTs
    })

    if (filesToProcess.length === 0) {
      onProgress({
        stage: 'done', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 0,
        message: 'Ingen nye delta-filer siden seneste sync.',
      })
      return
    }

    onProgress({
      stage: 'importing', total: filesToProcess.length, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `${filesToProcess.length} nye delta-filer fundet — behandler...`,
    })

    let totalUpdated = 0, totalErrors = 0, processedFiles = 0

    for (const filename of filesToProcess) {
      const buf  = await downloadFile(client, `${FILES.stockDeltaDir}${filename}`)
      const rows = parseStockXml(buf)
      const res  = await applyStockRows(rows, SUPPLIER_ID, supabase, null)

      totalUpdated += res.updated
      totalErrors  += res.errors
      processedFiles++

      const ts = parseDeltaTimestamp(filename, FILES.stockDeltaPrefix)
      await supabase.from('suppliers').update({
        last_synced_at: new Date().toISOString(),
        sync_state: { ...syncState, last_stock_delta_ts: ts },
      }).eq('id', SUPPLIER_ID)

      onProgress({
        stage: 'importing', total: filesToProcess.length, processed: processedFiles,
        matched: 0, staged: 0, updated: totalUpdated, skipped: 0, errors: totalErrors,
        message: `${processedFiles}/${filesToProcess.length} delta-filer — ${rows.length} lager-poster i seneste fil`,
      })
    }

    onProgress({
      stage: 'done', total: filesToProcess.length, processed: processedFiles,
      matched: 0, staged: 0, updated: totalUpdated, skipped: 0, errors: totalErrors,
      message: `Lagersync færdig! ${filesToProcess.length} filer · ${totalUpdated} poster opdateret`,
    })

  } finally {
    client.close()
  }
}

// ── Anvend lager-rækker mod product_suppliers ────────────────

async function applyStockRows(
  rows: StockRow[],
  supplierId: string,
  supabase: ReturnType<typeof createServiceClient>,
  onProgress: ProgressCallback | null,
): Promise<{ updated: number; skipped: number; errors: number }> {
  const BATCH = 300
  let updated = 0, skipped = 0, errors = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const skus  = batch.map(r => String(r.ItemId))

    const { data: existing } = await supabase
      .from('product_suppliers')
      .select('id, supplier_sku')
      .eq('supplier_id', supplierId)
      .in('supplier_sku', skus)

    const idBySku = Object.fromEntries((existing ?? []).map(r => [r.supplier_sku, r.id]))

    const ops: Promise<void>[] = []
    for (const row of batch) {
      const sku = String(row.ItemId)
      const id  = idBySku[sku]
      const qty = Number(row.OnHandAvailPhysical) || 0

      if (!id) { skipped++; continue }

      updated++
      ops.push(Promise.resolve(
        supabase.from('product_suppliers')
          .update({
            supplier_stock_quantity:   qty,
            item_status:               qty > 0 ? 'active' : 'out_of_stock',
            supplier_stock_updated_at: new Date().toISOString(),
          })
          .eq('id', id)
      ).then(({ error }) => { if (error) { errors++; updated-- } }))
    }
    await Promise.all(ops)

    onProgress?.({
      stage: 'importing', total: rows.length, processed: Math.min(i + BATCH, rows.length),
      matched: 0, staged: 0, updated, skipped, errors,
      message: `${Math.min(i + BATCH, rows.length).toLocaleString('da-DK')} / ${rows.length.toLocaleString('da-DK')} lager-poster...`,
    })
  }

  return { updated, skipped, errors }
}
