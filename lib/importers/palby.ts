import { createServiceClient } from '@/lib/supabase/server'
import { XMLParser } from 'fast-xml-parser'
import * as ftp from 'basic-ftp'

// ── Palby leverandør-ID hentes dynamisk fra suppliers-tabellen ──
const CATALOG_FILTER = 'Kompakt'  // kun web-publicerede produkter

type PalbyProduct = {
  ItemId:                    string
  ItemName:                  string
  ItemCaption:               string
  ShortTxt:                  string
  DescriptionTxt:            string
  SpecificationsTxt:         string
  ItemImageLargeUrl:         string
  AlternateItemImages?:      { Img?: { Url: string } | { Url: string }[] }
  GrossSalesPrice:           number
  GrossSalesPriceExlTax:     number
  SalesPrice:                number
  CurrencyCode:              string
  LowestQty:                 number
  MultipleQty:               number
  ItemEan:                   string
  GrossWeight:               number
  OnHandAvailPhysical:       number
  OnHandAvailMore:           string
  MainItemId:                string
  ItemBrand:                 string
  HeaderItem:                string   // 'Yes' | 'No' — 'Yes' = master/grouping, ikke fysisk vare
  InStockConfirmed:          string
  InStockBestGuess:          string
  StockOrderedQty:           number
  OrigCountryRegionId:       string
  Intracode:                 string
  CatalogCategories?:        { Category: string | string[] }
  Catalog?:                  { CatalogNode: { CatalogId: string } | { CatalogId: string }[] }
}

export type PalbyImportProgress = {
  stage:     'connecting' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  matched:   number
  staged:    number
  updated:   number
  skipped:   number   // Header/master-items der ikke er fysiske produkter
  errors:    number
  message:   string
}

type ProgressCallback = (p: PalbyImportProgress) => void

type SupplierConfig = {
  id:           string
  ftp_host:     string
  ftp_port:     number
  ftp_user:     string
  ftp_password: string
  ftp_path:     string
}

// ── Hent XML-fil via FTP ──
async function downloadXmlViаFtp(config: SupplierConfig, filePath?: string): Promise<Buffer> {
  const client = new ftp.Client()
  client.ftp.verbose = false

  try {
    await client.access({
      host:     config.ftp_host,
      port:     config.ftp_port || 21,
      user:     config.ftp_user,
      password: config.ftp_password,
      secure:   false,
    })

    const chunks: Buffer[] = []
    const { Writable } = await import('stream')
    const writable = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb() },
    })

    const targetPath = filePath ?? config.ftp_path
    await client.downloadTo(writable, targetPath)
    return Buffer.concat(chunks)
  } finally {
    client.close()
  }
}

// ── Parse billeder ──
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

// ── Parse kategorier ──
function parseCategories(p: PalbyProduct): string[] {
  if (!p.CatalogCategories?.Category) return []
  const cats = Array.isArray(p.CatalogCategories.Category)
    ? p.CatalogCategories.Category
    : [p.CatalogCategories.Category]

  // Hvert Category er en sti som "Motortilbehør > Sejlads > Ankre"
  // Vi flader til unikke blade-kategorier
  const result = new Set<string>()
  for (const cat of cats) {
    const parts = cat.split('>').map(c => c.trim()).filter(Boolean)
    if (parts.length > 0) result.add(parts[parts.length - 1]) // blade-kategori
    parts.forEach(p => result.add(p))
  }
  return [...result]
}

// ── Er produktet web-publiceret (Kompakt-katalog)? ──
function isWebPublished(p: PalbyProduct): boolean {
  if (!p.Catalog) return false
  const nodes = Array.isArray(p.Catalog.CatalogNode)
    ? p.Catalog.CatalogNode
    : p.Catalog.CatalogNode ? [p.Catalog.CatalogNode] : []
  return nodes.some(n => n.CatalogId === CATALOG_FILTER)
}

export async function importPalby(
  onProgress: ProgressCallback,
  options: { limit?: number; filePath?: string } = {}
): Promise<void> {
  const supabase = createServiceClient()

  // ── Hent leverandør-config fra Supabase ──
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, ftp_path')
    .eq('name', 'Palby')
    .single()

  if (supErr || !supplier) {
    throw new Error(`Palby leverandør ikke fundet i Supabase: ${supErr?.message}`)
  }

  if (!supplier.ftp_host || !supplier.ftp_user) {
    throw new Error('Palby FTP-legitimationsoplysninger er endnu ikke konfigureret. Opdater leverandøren med ftp_host, ftp_user og ftp_password.')
  }

  const SUPPLIER_ID = supplier.id as string

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Palby FTP...',
  })

  // ── Download XML ──
  onProgress({
    stage: 'downloading', total: 0, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: 'Henter produktfil fra Palby FTP...',
  })

  let xmlBuffer: Buffer
  try {
    xmlBuffer = await downloadXmlViаFtp(supplier as SupplierConfig, options.filePath)
  } catch (e: unknown) {
    throw new Error(`FTP fejl: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── Parse XML ──
  onProgress({
    stage: 'parsing', total: 0, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: 'Parser XML...',
  })

  const parser = new XMLParser({
    ignoreAttributes:    false,
    parseTagValue:       true,
    parseAttributeValue: true,
    isArray: (name) => ['InventTable', 'Img', 'Category', 'CatalogNode', 'AccessoryItem', 'RelatedItem', 'Li'].includes(name),
  })

  const parsed = parser.parse(xmlBuffer.toString('utf-8'))
  let products: PalbyProduct[] = parsed?.Export?.Service?.Body?.InventTable ?? []

  // Filtrer til kun Kompakt-katalog (web-publicerede) + skip master/grouping items
  products = products.filter(p =>
    p.HeaderItem !== 'Yes' &&  // kun fysiske produkter
    isWebPublished(p)
  )

  if (options.limit) products = products.slice(0, options.limit)

  const total = products.length

  onProgress({
    stage: 'importing', total, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} produkter fundet — starter matching...`,
  })

  // ── Hent eksisterende product_suppliers for Palby ──
  const { data: existingSpRows } = await supabase
    .from('product_suppliers')
    .select('id, supplier_sku, product_id, priority')
    .eq('supplier_id', SUPPLIER_ID)

  const existingBySku = Object.fromEntries(
    (existingSpRows ?? []).map(r => [r.supplier_sku, r])
  )

  // ── Hent eksisterende staging-rækker ──
  const { data: existingStagingRows } = await supabase
    .from('supplier_product_staging')
    .select('id, normalized_sku, status')
    .eq('supplier_id', SUPPLIER_ID)

  const existingStaging = Object.fromEntries(
    (existingStagingRows ?? []).map(r => [r.normalized_sku, r])
  )

  // ── Importer i batches ──
  const BATCH = 100
  let processed = 0, matched = 0, staged = 0, updated = 0, skipped = 0, errors = 0

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)

    // Batch EAN-opslag
    const eans = batch.map(p => String(p.ItemEan || '')).filter(Boolean)
    const { data: byEan } = eans.length > 0
      ? await supabase.from('products').select('id, name, ean').in('ean', eans)
      : { data: [] }

    const productByEan = Object.fromEntries(
      (byEan ?? []).filter(p => p.ean).map(p => [String(p.ean), p])
    )

    for (const p of batch) {
      const ean        = p.ItemEan ? String(p.ItemEan) : null
      const images     = parseImages(p)
      const categories = parseCategories(p)

      const supplierData = {
        supplier_id:             SUPPLIER_ID,
        supplier_sku:            String(p.ItemId),
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
          short_description:   p.ShortTxt         || null,
          description:         p.DescriptionTxt   || null,
          specifications:      p.SpecificationsTxt || null,
          ean,
          weight:              p.GrossWeight       || null,
          brand:               p.ItemBrand         || null,
          categories,
          origin_country:      p.OrigCountryRegionId || null,
          hs_code:             p.Intracode         || null,
          main_item_id:        p.MainItemId        || null,
          in_stock_confirmed:  p.InStockConfirmed  || null,
          in_stock_best_guess: p.InStockBestGuess  || null,
          stock_ordered_qty:   Number(p.StockOrderedQty) || 0,
          multiple_qty:        Number(p.MultipleQty) || null,
          on_hand_avail_more:  p.OnHandAvailMore === 'Yes',
        },
        variant_id: null,
        is_active:  true,
      }

      // ── EAN-match ──
      const matchedProduct = ean ? productByEan[ean] ?? null : null

      if (matchedProduct) {
        const existing = existingBySku[String(p.ItemId)]

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
          if (error) errors++
          else matched++
        }
      } else {
        // Ingen match → staging
        const stagingRow = existingStaging[String(p.ItemId)]

        if (stagingRow && stagingRow.status !== 'pending_review') {
          // Allerede behandlet — opdater kun rådata
          await supabase
            .from('supplier_product_staging')
            .update({
              raw_data:             supplierData.extra_data,
              normalized_unit:      null,
              normalized_unit_size: null,
              updated_at:           new Date().toISOString(),
            })
            .eq('id', stagingRow.id)
          processed++
          continue
        }

        const stagingUpsertRow = {
          supplier_id:          SUPPLIER_ID,
          raw_data: {
            ...supplierData.extra_data,
            supplier_sku:            String(p.ItemId),
            supplier_product_name:   supplierData.supplier_product_name,
            purchase_price:          supplierData.purchase_price,
            recommended_sales_price: supplierData.recommended_sales_price,
            supplier_stock_quantity: supplierData.supplier_stock_quantity,
            supplier_images:         images,
          },
          normalized_name:      p.ItemCaption || p.ItemName,
          normalized_ean:       ean,
          normalized_sku:       String(p.ItemId),
          normalized_unit:      null,
          normalized_unit_size: null,
          match_suggestions:    [],
          status:               stagingRow ? stagingRow.status : 'pending_review',
          updated_at:           new Date().toISOString(),
        }

        const { error } = stagingRow
          ? await supabase.from('supplier_product_staging').update(stagingUpsertRow).eq('id', stagingRow.id)
          : await supabase.from('supplier_product_staging').insert(stagingUpsertRow)

        if (error) errors++
        else staged++
      }

      processed++
    }

    // Opdater last_synced_at
    await supabase
      .from('suppliers')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', SUPPLIER_ID)

    onProgress({
      stage: 'importing', total, processed, matched, staged, updated, skipped, errors,
      message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
    })
  }

  onProgress({
    stage: 'done', total, processed, matched, staged, updated, skipped, errors,
    message: `Færdig! ${matched} matchet · ${updated} opdateret · ${staged} afventer gennemgang · ${errors} fejl`,
  })
}

// ── Hent kun lager-opdateringer (hurtig variant via stockstatus-fil) ──
export async function syncPalbyStock(onProgress: ProgressCallback): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password')
    .eq('name', 'Palby')
    .single()

  if (supErr || !supplier || !supplier.ftp_host) {
    throw new Error('Palby FTP ikke konfigureret')
  }

  const SUPPLIER_ID = supplier.id as string

  onProgress({
    stage: 'downloading', total: 0, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: 'Henter lagerstatus fra Palby FTP...',
  })

  const xmlBuffer = await downloadXmlViаFtp(
    supplier as SupplierConfig,
    '/web_stockstatus_newitemid.xml'
  )

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue:    true,
    isArray: (name) => ['InventTable'].includes(name),
  })

  const parsed = parser.parse(xmlBuffer.toString('utf-8'))
  const rows: Array<{ ItemId: string; OnHandAvailPhysical: number; ItemBarcode: string }> =
    parsed?.Export?.Service?.Body?.InventTable ?? []

  const total = rows.length
  onProgress({
    stage: 'importing', total, processed: 0, matched: 0, staged: 0,
    updated: 0, skipped: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} lagerposter — opdaterer...`,
  })

  const BATCH = 200
  let processed = 0, updated = 0, errors = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const skus  = batch.map(r => String(r.ItemId))

    const { data: existing } = await supabase
      .from('product_suppliers')
      .select('id, supplier_sku')
      .eq('supplier_id', SUPPLIER_ID)
      .in('supplier_sku', skus)

    const existingBySkuId = Object.fromEntries((existing ?? []).map(r => [r.supplier_sku, r.id]))

    for (const row of batch) {
      const sku = String(row.ItemId)
      const qty = Number(row.OnHandAvailPhysical) || 0
      const id  = existingBySkuId[sku]

      if (id) {
        const { error } = await supabase
          .from('product_suppliers')
          .update({
            supplier_stock_quantity: qty,
            item_status: qty > 0 ? 'active' : 'out_of_stock',
            supplier_stock_updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (error) errors++
        else updated++
      }
      processed++
    }

    onProgress({
      stage: 'importing', total, processed, matched: 0, staged: 0,
      updated, skipped: 0, errors,
      message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} lager-poster opdateret`,
    })
  }

  await supabase
    .from('suppliers')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', SUPPLIER_ID)

  onProgress({
    stage: 'done', total, processed, matched: 0, staged: 0,
    updated, skipped: 0, errors,
    message: `Lagersync færdig! ${updated} opdateret · ${errors} fejl`,
  })
}
