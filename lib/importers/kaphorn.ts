import { createServiceClient } from '@/lib/supabase/server'
import { XMLParser } from 'fast-xml-parser'
import * as ftp from 'basic-ftp'
import { Writable } from 'stream'

const FILES = {
  products: '/productfeed.xml',
  stock:    '/ballag.xml',
}

// ── Types ────────────────────────────────────────────────────

type KapHornProduct = {
  'Baltic-Child-Vnr':         string   // primary SKU (e.g. "0125-000-1") — matches ArtNr in ballag
  'Baltic-Parent-Vnr-Pointer': string  // parent SKU for variant grouping
  'GrandParent':               string
  'KapHorn-Child-Vnr':        string
  'MPS-Child-Vnr':            string
  HeadLinePlain:               string
  ShortPlain:                  string
  LongPlain:                   string
  SpecPlain:                   string
  LongSpecPdfHtml:             string  // HTML incl. links — PDF URLs available separately via PDF1-3URL
  ean13:                       string | number
  'weight-kg':                 number | string
  category:                    string
  'category-sub2':             string
  Farve:                       string
  'Size1-2':                   string
  Size1:                       string
  Size2:                       string
  ImageURL:                    string
  ImageURL_MPS:                string
  PDF1URL:                     string
  PDF2URL:                     string
  PDF3URL:                     string
  'Accessories1BAL':           string
  'Accessories2BAL':           string
  'Accessories3BAL':           string
  'Related1BAL':               string
  'Related2BAL':               string
  'Related3BAL':               string
  Pack:                        number | string
  VejlInclMoms:                number | string
}

type KapHornStockRow = {
  ArtNr:          string
  LagerNU:        number | string
  'First-Free':   string
  'EAN-13':       string | number
  VejlInclMoms:   number | string
  status:         string
}

export type KapHornImportProgress = {
  stage:     'connecting' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  matched:   number
  staged:    number
  updated:   number
  skipped:   number
  errors:    number
  message:   string
}

export type KapHornStockProgress = {
  stage:     'connecting' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  updated:   number
  skipped:   number
  errors:    number
  message:   string
}

type ProgressCallback      = (p: KapHornImportProgress) => void
type StockProgressCallback = (p: KapHornStockProgress)  => void

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

// ── XML parsers ──────────────────────────────────────────────

const PRODUCT_PARSER = new XMLParser({
  ignoreAttributes:    false,
  parseTagValue:       true,
  parseAttributeValue: true,
  processEntities:     false,
  isArray: (name) => name === 'products',
})

const STOCK_PARSER = new XMLParser({
  ignoreAttributes:    false,
  parseTagValue:       true,
  parseAttributeValue: true,
  isArray: (name) => name === '_x0031_1-genericlagerliste',
})

function parseProductFeed(buf: Buffer): KapHornProduct[] {
  const parsed = PRODUCT_PARSER.parse(buf.toString('utf-8'))
  return parsed?.dataroot?.products ?? []
}

function parseStockFeed(buf: Buffer): KapHornStockRow[] {
  const parsed = STOCK_PARSER.parse(buf.toString('utf-8'))
  return parsed?.dataroot?.['_x0031_1-genericlagerliste'] ?? []
}

// ── Helpers ──────────────────────────────────────────────────

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return isNaN(n) ? null : n
}

function normalizeEan(val: string | number | undefined): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return null
    return String(Math.round(val))
  }
  const s = String(val).trim().replace(/\.0+$/, '')
  return s && s !== '0' ? s : null
}

function strOrNull(val: unknown): string | null {
  const s = String(val ?? '').trim()
  return s || null
}

// VejlInclMoms is incl. 25% Danish VAT — convert to excl. VAT
function vejlExclVat(val: unknown): number | null {
  const n = toNum(val)
  return n != null && n > 0 ? Math.round((n / 1.25) * 100) / 100 : null
}

// ── PDF-links (direkte URL — ingen upload til Storage) ───────

function buildSupplierFiles(
  p: KapHornProduct
): Array<{ url: string; name: string; type: string }> {
  return [p.PDF1URL, p.PDF2URL, p.PDF3URL]
    .map(u => String(u ?? '').trim())
    .filter(Boolean)
    .map(url => ({
      url,
      name: url.split('/').pop()?.split('?')[0] ?? 'Dokument.pdf',
      type: 'spec',
    }))
}

// ── Product import ───────────────────────────────────────────

export async function importKapHorn(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, sync_state')
    .eq('name', 'Kap-Horn')
    .single()

  if (supErr || !supplier) throw new Error(`Kap-Horn leverandør ikke fundet: ${supErr?.message}`)
  if (!supplier.ftp_host) throw new Error('Kap-Horn FTP-legitimationsoplysninger mangler')

  const s           = supplier as SupplierRow
  const SUPPLIER_ID = s.id

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Kap-Horn FTP...',
  })

  const client = await ftpConnect(s)

  try {
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `Henter productfeed.xml fra Kap-Horn FTP...`,
    })

    const xmlBuf = await downloadFile(client, FILES.products)

    onProgress({
      stage: 'parsing', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Parser productfeed.xml...',
    })

    let products = parseProductFeed(xmlBuf)
    if (options.limit) products = products.slice(0, options.limit)

    const total = products.length

    onProgress({
      stage: 'importing', total, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `${total.toLocaleString('da-DK')} produkter — starter matching...`,
    })

    // Preload existing product_suppliers and staging rows
    const { data: existingSpRows } = await supabase
      .from('product_suppliers')
      .select('id, supplier_sku, product_id, priority, supplier_files')
      .eq('supplier_id', SUPPLIER_ID)

    const existingBySku = Object.fromEntries(
      (existingSpRows ?? []).map(r => [r.supplier_sku, r])
    )

    const { data: existingStagingRows } = await supabase
      .from('supplier_product_staging')
      .select('id, normalized_sku, status')
      .eq('supplier_id', SUPPLIER_ID)

    const existingStaging = Object.fromEntries(
      (existingStagingRows ?? []).map(r => [r.normalized_sku, r])
    )

    const BATCH = 50  // Smaller batches due to PDF downloads
    let processed = 0, matched = 0, staged = 0, updated = 0, skipped = 0, errors = 0

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH)

      // Batch EAN lookup
      const eans = batch.map(p => normalizeEan(p.ean13)).filter((e): e is string => !!e)
      const { data: byEan } = eans.length > 0
        ? await supabase.from('products').select('id, ean').in('ean', eans)
        : { data: [] }
      const productByEan = Object.fromEntries(
        (byEan ?? []).filter(p => p.ean).map(p => [String(p.ean), p])
      )

      for (const p of batch) {
        const sku = String(p['Baltic-Child-Vnr'] ?? '').trim()
        if (!sku) { processed++; continue }

        const ean            = normalizeEan(p.ean13)
        const vejlExcl       = vejlExclVat(p.VejlInclMoms)
        const matchedProduct = ean ? (productByEan[ean] ?? null) : null
        const existing       = existingBySku[sku]

        const categories: string[] = []
        if (p.category)          categories.push(String(p.category).trim())
        if (p['category-sub2'])  categories.push(String(p['category-sub2']).trim())

        const accessories = [p['Accessories1BAL'], p['Accessories2BAL'], p['Accessories3BAL']]
          .map(v => strOrNull(v)).filter(Boolean)
        const related = [p['Related1BAL'], p['Related2BAL'], p['Related3BAL']]
          .map(v => strOrNull(v)).filter(Boolean)

        // Build supplier_files — direkte links til PDFs på khsport2.dk (offentlige)
        const supplierFiles = buildSupplierFiles(p)

        // Build supplier_images
        const imageUrl = String(p.ImageURL ?? '').trim()
        const supplierImages = imageUrl
          ? [{ url: imageUrl, alt: String(p.HeadLinePlain ?? '').trim(), is_primary: true }]
          : []

        const supplierData = {
          supplier_id:             SUPPLIER_ID,
          supplier_sku:            sku,
          supplier_product_name:   strOrNull(p.HeadLinePlain) ?? sku,
          purchase_price:          null,   // Not in feed
          recommended_sales_price: vejlExcl,
          moq:                     toNum(p.Pack) ?? 1,
          supplier_images:         supplierImages,
          supplier_files:          supplierFiles,
          extra_data: {
            ean,
            kh_sku:       strOrNull(p['KapHorn-Child-Vnr']),
            mps_sku:      strOrNull(p['MPS-Child-Vnr']),
            parent_sku:   strOrNull(p['Baltic-Parent-Vnr-Pointer']),
            vejl_incl_moms: toNum(p.VejlInclMoms),
            short_desc:   strOrNull(p.ShortPlain),
            long_desc:    strOrNull(p.LongPlain),
            spec:         strOrNull(p.SpecPlain),
            long_spec_html: strOrNull(p.LongSpecPdfHtml),
            weight_kg:    toNum(p['weight-kg']),
            categories,
            color:        strOrNull(p.Farve),
            size:         strOrNull(p['Size1-2']),
            accessories,
            related,
          },
          variant_id: null,
          is_active:  true,
        }

        if (matchedProduct) {
          if (existing) {
            const { error } = await supabase.from('product_suppliers')
              .update({ ...supplierData, priority: existing.priority, supplier_stock_updated_at: new Date().toISOString() })
              .eq('id', existing.id)
            if (error) errors++; else updated++
          } else {
            const { error } = await supabase.from('product_suppliers')
              .insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
            if (error) errors++; else matched++
          }
        } else {
          const stagingRow = existingStaging[sku]

          if (stagingRow && stagingRow.status !== 'pending_review') {
            await supabase.from('supplier_product_staging')
              .update({
                raw_data: {
                  supplier_sku: sku, supplier_product_name: supplierData.supplier_product_name,
                  recommended_sales_price: vejlExcl, purchase_price: null,
                  supplier_images: supplierImages, supplier_files: supplierFiles,
                  ...supplierData.extra_data,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', stagingRow.id)
            skipped++
            processed++
            continue
          }

          const stagingUpsert = {
            supplier_id:          SUPPLIER_ID,
            raw_data: {
              supplier_sku:            sku,
              supplier_product_name:   supplierData.supplier_product_name,
              purchase_price:          null,
              recommended_sales_price: vejlExcl,
              supplier_images:         supplierImages,
              supplier_files:          supplierFiles,
              ...supplierData.extra_data,
            },
            normalized_name:      strOrNull(p.HeadLinePlain),
            normalized_ean:       ean,
            normalized_sku:       sku,
            normalized_unit:      null,
            normalized_unit_size: null,
            match_suggestions:    [],
            status:               stagingRow ? stagingRow.status : 'pending_review',
            updated_at:           new Date().toISOString(),
          }

          const { error } = stagingRow
            ? await supabase.from('supplier_product_staging').update(stagingUpsert).eq('id', stagingRow.id)
            : await supabase.from('supplier_product_staging').insert(stagingUpsert)
          if (error) errors++; else staged++
        }

        processed++
      }

      onProgress({
        stage: 'importing', total, processed, matched, staged, updated, skipped, errors,
        message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
      })
    }

    await supabase.from('suppliers')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_state: { ...(s.sync_state ?? {}), last_product_sync: new Date().toISOString() },
      })
      .eq('id', SUPPLIER_ID)

    onProgress({
      stage: 'done', total, processed, matched, staged, updated, skipped, errors,
      message: `Færdig! ${matched} matchet · ${updated} opdateret · ${staged} afventer gennemgang · ${errors} fejl`,
    })

  } finally {
    client.close()
  }
}

// ── Stock sync ───────────────────────────────────────────────

export async function syncKapHornStock(
  onProgress: StockProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, sync_state')
    .eq('name', 'Kap-Horn')
    .single()

  if (supErr || !supplier) throw new Error(`Kap-Horn leverandør ikke fundet: ${supErr?.message}`)
  if (!supplier.ftp_host) throw new Error('Kap-Horn FTP-legitimationsoplysninger mangler')

  const s           = supplier as SupplierRow
  const SUPPLIER_ID = s.id

  onProgress({
    stage: 'connecting', total: 0, processed: 0,
    updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Kap-Horn FTP...',
  })

  const client = await ftpConnect(s)

  try {
    onProgress({
      stage: 'downloading', total: 0, processed: 0,
      updated: 0, skipped: 0, errors: 0,
      message: 'Henter ballag.xml fra Kap-Horn FTP...',
    })

    const xmlBuf = await downloadFile(client, FILES.stock)

    onProgress({
      stage: 'parsing', total: 0, processed: 0,
      updated: 0, skipped: 0, errors: 0,
      message: 'Parser ballag.xml...',
    })

    let rows = parseStockFeed(xmlBuf)
    if (options.limit) rows = rows.slice(0, options.limit)

    const total = rows.length

    onProgress({
      stage: 'importing', total, processed: 0,
      updated: 0, skipped: 0, errors: 0,
      message: `${total.toLocaleString('da-DK')} lagerrækker — opdaterer...`,
    })

    const BATCH = 100
    let processed = 0, updated = 0, skipped = 0, errors = 0

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)

      for (const row of batch) {
        const sku = String(row.ArtNr ?? '').trim()
        if (!sku) { processed++; continue }

        const qty       = toNum(row.LagerNU) ?? 0
        const firstFree = strOrNull(row['First-Free'])
        const status    = String(row.status ?? '').trim()

        const { data: existing } = await supabase
          .from('product_suppliers')
          .select('id')
          .eq('supplier_id', SUPPLIER_ID)
          .eq('supplier_sku', sku)
          .maybeSingle()

        if (!existing) { skipped++; processed++; continue }

        const { error } = await supabase.from('product_suppliers')
          .update({
            supplier_stock_quantity:   qty,
            supplier_stock_reserved:   0,
            supplier_stock_updated_at: new Date().toISOString(),
            item_status:               qty > 0 ? 'active' : 'out_of_stock',
            extra_data:                { first_free: firstFree, supplier_status: status },
          })
          .eq('id', existing.id)

        if (error) errors++; else updated++
        processed++
      }

      onProgress({
        stage: 'importing', total, processed,
        updated, skipped, errors,
        message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${updated} opdateret`,
      })
    }

    await supabase.from('suppliers')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_state: { ...(s.sync_state ?? {}), last_stock_sync: new Date().toISOString() },
      })
      .eq('id', SUPPLIER_ID)

    onProgress({
      stage: 'done', total, processed,
      updated, skipped, errors,
      message: `Lager opdateret! ${updated} rækker · ${skipped} ikke fundet · ${errors} fejl`,
    })

  } finally {
    client.close()
  }
}
