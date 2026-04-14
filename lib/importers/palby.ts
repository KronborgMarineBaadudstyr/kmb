import { createServiceClient } from '@/lib/supabase/server'
import { XMLParser } from 'fast-xml-parser'
import * as ftp from 'basic-ftp'
import { Writable } from 'stream'

const CATALOG_FILTER = 'Kompakt'  // kun web-publicerede produkter

// Palby FTP fil-stier
const FILES = {
  productFull:    '/webcataloginventitems_cust_newitemid.xml',
  productDelta:   '/webcataloginventitems_cust_newitemid_delta.xml',
  stockFull:      '/web_stockstatus_newitemid.xml',
  stockDeltaDir:  '/',
  stockDeltaPrefix: 'web_stockstatus_newitemid_delta_',
}

type PalbyProduct = {
  ItemId:               string
  ItemName:             string
  ItemCaption:          string
  ShortTxt:             string
  DescriptionTxt:       string
  SpecificationsTxt:    string
  ItemImageLargeUrl:    string
  AlternateItemImages?: { Img?: { Url: string } | Array<{ Url: string }> }
  GrossSalesPrice:      number
  SalesPrice:           number
  LowestQty:            number
  MultipleQty:          number
  ItemEan:              string
  GrossWeight:          number
  OnHandAvailPhysical:  number
  OnHandAvailMore:      string
  MainItemId:           string
  ItemBrand:            string
  HeaderItem:           string
  InStockConfirmed:     string
  InStockBestGuess:     string
  StockOrderedQty:      number
  OrigCountryRegionId:  string
  Intracode:            string
  CatalogCategories?:   { Category: string | string[] }
  Catalog?:             { CatalogNode: { CatalogId: string } | Array<{ CatalogId: string }> }
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

// Liste filer i en FTP-mappe og returner navne der matcher prefix
async function listDeltaFiles(client: ftp.Client, dir: string, prefix: string): Promise<string[]> {
  const entries = await client.list(dir)
  return entries
    .filter(e => e.type === ftp.FileType.File && e.name.startsWith(prefix) && e.name.endsWith('.xml'))
    .map(e => e.name)
    .sort()  // filnavnene indeholder timestamp → kronologisk sortering ved string-sort
}

// Parse timestamp fra delta-filnavn: "web_stockstatus_newitemid_delta_20250414143000.xml" → "20250414143000"
function parseDeltaTimestamp(filename: string, prefix: string): string {
  return filename.replace(prefix, '').replace('.xml', '')
}

// ── XML parse helpers ────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes:    false,
  parseTagValue:       true,
  parseAttributeValue: true,
  isArray: (name) => ['InventTable', 'Img', 'Category', 'CatalogNode', 'AccessoryItem', 'RelatedItem', 'Li'].includes(name),
})

function parseProductXml(buf: Buffer): PalbyProduct[] {
  const parsed = XML_PARSER.parse(buf.toString('utf-8'))
  return parsed?.Export?.Service?.Body?.InventTable ?? []
}

function parseStockXml(buf: Buffer): StockRow[] {
  const parsed = XML_PARSER.parse(buf.toString('utf-8'))
  return parsed?.Export?.Service?.Body?.InventTable ?? []
}

function parseImages(p: PalbyProduct): Array<{ url: string; alt: string; is_primary: boolean }> {
  const images: Array<{ url: string; alt: string; is_primary: boolean }> = []
  if (p.ItemImageLargeUrl) {
    images.push({ url: p.ItemImageLargeUrl, alt: p.ItemCaption || p.ItemName, is_primary: true })
  }
  const alt = p.AlternateItemImages
  if (alt?.Img) {
    const imgs = Array.isArray(alt.Img) ? alt.Img : [alt.Img]
    for (const img of imgs) {
      if (img.Url) images.push({ url: img.Url, alt: p.ItemCaption || p.ItemName, is_primary: false })
    }
  }
  return images
}

function parseCategories(p: PalbyProduct): string[] {
  if (!p.CatalogCategories?.Category) return []
  const cats = Array.isArray(p.CatalogCategories.Category)
    ? p.CatalogCategories.Category
    : [p.CatalogCategories.Category]
  const result = new Set<string>()
  for (const cat of cats) {
    cat.split('>').map((c: string) => c.trim()).filter(Boolean).forEach((c: string) => result.add(c))
  }
  return [...result]
}

function isWebPublished(p: PalbyProduct): boolean {
  if (!p.Catalog) return false
  const nodes = Array.isArray(p.Catalog.CatalogNode)
    ? p.Catalog.CatalogNode
    : p.Catalog.CatalogNode ? [p.Catalog.CatalogNode] : []
  return nodes.some(n => n.CatalogId === CATALOG_FILTER)
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

  const s = supplier as SupplierRow
  const SUPPLIER_ID = s.id

  // Brug delta-fil hvis vi har synkroniseret før og delta=true
  const hasPreviousSync = !!(s.sync_state?.last_full_product_sync)
  const useDelta = options.delta && hasPreviousSync

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: `Forbinder til Palby FTP (${useDelta ? 'delta' : 'fuld'} import)...`,
  })

  const client = await ftpConnect(s)

  try {
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Henter produktfil fra Palby FTP...',
    })

    const filePath = useDelta ? FILES.productDelta : FILES.productFull
    const xmlBuf   = await downloadFile(client, filePath)

    onProgress({
      stage: 'parsing', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Parser XML...',
    })

    let products = parseProductXml(xmlBuf).filter(p =>
      p.HeaderItem !== 'Yes' && isWebPublished(p)
    )

    if (options.limit) products = products.slice(0, options.limit)

    const total = products.length

    onProgress({
      stage: 'importing', total, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `${total.toLocaleString('da-DK')} produkter — starter matching...`,
    })

    // Hent eksisterende product_suppliers og staging
    const { data: existingSpRows } = await supabase
      .from('product_suppliers').select('id, supplier_sku, product_id, priority').eq('supplier_id', SUPPLIER_ID)
    const existingBySku = Object.fromEntries((existingSpRows ?? []).map(r => [r.supplier_sku, r]))

    const { data: existingStagingRows } = await supabase
      .from('supplier_product_staging').select('id, normalized_sku, status').eq('supplier_id', SUPPLIER_ID)
    const existingStaging = Object.fromEntries((existingStagingRows ?? []).map(r => [r.normalized_sku, r]))

    const BATCH = 100
    let processed = 0, matched = 0, staged = 0, updated = 0, skipped = 0, errors = 0

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH)

      const eans = batch.map(p => String(p.ItemEan || '')).filter(Boolean)
      const { data: byEan } = eans.length > 0
        ? await supabase.from('products').select('id, name, ean').in('ean', eans)
        : { data: [] }
      const productByEan = Object.fromEntries((byEan ?? []).filter(p => p.ean).map(p => [String(p.ean), p]))

      for (const p of batch) {
        const ean      = p.ItemEan ? String(p.ItemEan) : null
        const images   = parseImages(p)
        const cats     = parseCategories(p)
        const skuStr   = String(p.ItemId)

        const supplierData = {
          supplier_id:             SUPPLIER_ID,
          supplier_sku:            skuStr,
          supplier_product_name:   p.ItemCaption || p.ItemName,
          purchase_price:          p.SalesPrice      > 0 ? p.SalesPrice      : null,
          recommended_sales_price: p.GrossSalesPrice > 0 ? p.GrossSalesPrice : null,
          supplier_stock_quantity: Number(p.OnHandAvailPhysical) || 0,
          supplier_stock_reserved: 0,
          item_status:             (Number(p.OnHandAvailPhysical) || 0) > 0 ? 'active' : 'out_of_stock',
          moq:                     Number(p.LowestQty) || 1,
          supplier_images:         images,
          extra_data: {
            item_name:           p.ItemName,
            short_description:   p.ShortTxt          || null,
            description:         p.DescriptionTxt    || null,
            specifications:      p.SpecificationsTxt || null,
            ean,
            weight:              p.GrossWeight        || null,
            brand:               p.ItemBrand          || null,
            categories:          cats,
            origin_country:      p.OrigCountryRegionId || null,
            hs_code:             p.Intracode          || null,
            main_item_id:        p.MainItemId         || null,
            in_stock_confirmed:  p.InStockConfirmed   || null,
            in_stock_best_guess: p.InStockBestGuess   || null,
            multiple_qty:        Number(p.MultipleQty) || null,
            on_hand_avail_more:  p.OnHandAvailMore === 'Yes',
          },
          variant_id: null,
          is_active:  true,
        }

        const matchedProduct = ean ? (productByEan[ean] ?? null) : null

        if (matchedProduct) {
          const existing = existingBySku[skuStr]
          if (existing) {
            await supabase.from('product_suppliers')
              .update({ ...supplierData, priority: existing.priority }).eq('id', existing.id)
            updated++
          } else {
            const { error } = await supabase.from('product_suppliers')
              .insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
            if (error) errors++; else matched++
          }
        } else {
          const stagingRow = existingStaging[skuStr]
          if (stagingRow && stagingRow.status !== 'pending_review') {
            await supabase.from('supplier_product_staging')
              .update({ raw_data: supplierData.extra_data, updated_at: new Date().toISOString() })
              .eq('id', stagingRow.id)
            processed++
            continue
          }

          const stagingUpsertRow = {
            supplier_id:          SUPPLIER_ID,
            raw_data: {
              ...supplierData.extra_data,
              supplier_sku:            skuStr,
              supplier_product_name:   supplierData.supplier_product_name,
              purchase_price:          supplierData.purchase_price,
              recommended_sales_price: supplierData.recommended_sales_price,
              supplier_stock_quantity: supplierData.supplier_stock_quantity,
              supplier_images:         images,
            },
            normalized_name:      p.ItemCaption || p.ItemName,
            normalized_ean:       ean,
            normalized_sku:       skuStr,
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

      onProgress({
        stage: 'importing', total, processed, matched, staged, updated, skipped, errors,
        message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
      })
    }

    // Opdater last_synced_at + sync_state
    const newSyncState = {
      ...(s.sync_state ?? {}),
      last_full_product_sync: new Date().toISOString(),
    }
    await supabase.from('suppliers')
      .update({ last_synced_at: new Date().toISOString(), sync_state: newSyncState })
      .eq('id', SUPPLIER_ID)

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
// Palby opdaterer delta-lagerfiler hvert 15. min med timestampet filnavn:
//   web_stockstatus_newitemid_delta_<YYYYMMDDHHMMSS>.xml
// Vi henter kun filer nyere end sidst behandlede timestamp.

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

  const s          = supplier as SupplierRow
  const SUPPLIER_ID = s.id
  const syncState  = s.sync_state ?? {}

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Palby FTP...',
  })

  const client = await ftpConnect(s)

  try {
    let filesToProcess: string[] = []
    let lastDeltaTs = syncState.last_stock_delta_ts ?? ''

    if (options.full || !lastDeltaTs) {
      // Første kørsel eller fuld sync — brug den komplette lagerfil
      onProgress({
        stage: 'downloading', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 0,
        message: 'Henter komplet lagerstatus (første kørsel)...',
      })

      const buf   = await downloadFile(client, FILES.stockFull)
      const rows  = parseStockXml(buf)
      const count = await applyStockRows(rows, SUPPLIER_ID, supabase, onProgress)

      // Gem den seneste delta-timestamp som baseline
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
        matched: 0, staged: 0, updated: count.updated, skipped: count.skipped, errors: count.errors,
        message: `Lagersync færdig! ${count.updated} opdateret · ${count.errors} fejl`,
      })
      return
    }

    // Delta-kørsel — find filer nyere end lastDeltaTs
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Finder nye delta-filer på FTP...',
    })

    const allDeltas = await listDeltaFiles(client, FILES.stockDeltaDir, FILES.stockDeltaPrefix)
    filesToProcess  = allDeltas.filter(f => {
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

    let totalUpdated = 0, totalErrors = 0
    let processedFiles = 0

    for (const filename of filesToProcess) {
      const buf  = await downloadFile(client, `${FILES.stockDeltaDir}${filename}`)
      const rows = parseStockXml(buf)
      const res  = await applyStockRows(rows, SUPPLIER_ID, supabase, null)

      totalUpdated += res.updated
      totalErrors  += res.errors
      processedFiles++

      // Gem løbende fremskridt
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

    for (const row of batch) {
      const sku = String(row.ItemId)
      const id  = idBySku[sku]
      const qty = Number(row.OnHandAvailPhysical) || 0

      if (!id) { skipped++; continue }

      const { error } = await supabase
        .from('product_suppliers')
        .update({
          supplier_stock_quantity:   qty,
          item_status:               qty > 0 ? 'active' : 'out_of_stock',
          supplier_stock_updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) errors++; else updated++
    }

    onProgress?.({
      stage: 'importing', total: rows.length, processed: Math.min(i + BATCH, rows.length),
      matched: 0, staged: 0, updated, skipped, errors,
      message: `${Math.min(i + BATCH, rows.length).toLocaleString('da-DK')} / ${rows.length.toLocaleString('da-DK')} lager-poster...`,
    })
  }

  return { updated, skipped, errors }
}
