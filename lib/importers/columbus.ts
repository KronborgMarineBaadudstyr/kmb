import { createServiceClient } from '@/lib/supabase/server'
import { XMLParser } from 'fast-xml-parser'
import * as ftp from 'basic-ftp'
import { Writable } from 'stream'

// Columbus Marine bruger to XML-filer:
//   ColumbusCommonStock.xml — fælles sortiment (alle kunder)
//   ColumbusStock.xml       — fuldt sortiment inkl. kundespecifikke varer
// Vi bruger ColumbusStock.xml for at få hele katalogget.
const FILES = {
  stockFull: '/V30/ColumbusStock.xml',
}

type ColumbusProduct = {
  ItemId:               string
  ItemGroup:            string
  DiscGroup:            string
  Text:                 string
  InStock:              number
  InStockExpected:      string
  SalesPrice:           number    // indkøbspris
  GrossSalesPrice:      number    // vejledende salgspris
  EAN:                  string
  Height:               number
  Length:               number
  Width:                number
  NetWeight:            number
  PipedItemDetailsText: string    // pipe-separeret beskrivelse
  CatParent:            string
  CatChild:             string
}

export type ColumbusImportProgress = {
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

type ProgressCallback = (p: ColumbusImportProgress) => void

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

// ── XML parser ───────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes:    false,
  parseTagValue:       true,
  parseAttributeValue: true,
  isArray: (name) => ['Product'].includes(name),
})

function parseColumbusXml(buf: Buffer): ColumbusProduct[] {
  const text   = buf.toString('utf-8')
  const parsed = XML_PARSER.parse(text)
  return parsed?.ColumbusStock?.ProductList?.Product ?? []
}

// Konverter pipe-separeret tekst til beskrivelse
function formatDescription(piped: unknown): string | null {
  if (!piped) return null
  return String(piped).split('|').map(s => s.trim()).filter(Boolean).join('\n')
}

// ── Produktimport ────────────────────────────────────────────

export async function importColumbus(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, ftp_host, ftp_port, ftp_user, ftp_password, sync_state')
    .eq('name', 'Columbus Marine')
    .single()

  if (supErr || !supplier) throw new Error(`Columbus Marine ikke fundet: ${supErr?.message}`)
  if (!supplier.ftp_host) throw new Error('Columbus Marine FTP-legitimationsoplysninger mangler')

  const s           = supplier as SupplierRow
  const SUPPLIER_ID = s.id

  onProgress({
    stage: 'connecting', total: 0, processed: 0, matched: 0,
    staged: 0, updated: 0, skipped: 0, errors: 0,
    message: 'Forbinder til Columbus Marine FTP...',
  })

  const client = await ftpConnect(s)

  try {
    onProgress({
      stage: 'downloading', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `Henter produktfil fra Columbus Marine FTP (${FILES.stockFull})...`,
    })

    const xmlBuf = await downloadFile(client, FILES.stockFull)

    onProgress({
      stage: 'parsing', total: 0, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: 'Parser XML...',
    })

    let products = parseColumbusXml(xmlBuf)
    if (options.limit) products = products.slice(0, options.limit)

    const total = products.length

    onProgress({
      stage: 'importing', total, processed: 0, matched: 0,
      staged: 0, updated: 0, skipped: 0, errors: 0,
      message: `${total.toLocaleString('da-DK')} produkter — starter matching...`,
    })

    // Hent eksisterende product_suppliers og staging — pagineret for at undgå Supabase's 1000-rækkegrænse
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

    const BATCH = 200
    let processed = 0, matched = 0, staged = 0, updated = 0, skipped = 0, errors = 0

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH)

      const eans = batch.map(p => String(p.EAN || '')).filter(e => e && e !== '0')
      const { data: byEan } = eans.length > 0
        ? await supabase.from('products').select('id, name, ean').in('ean', eans)
        : { data: [] }
      const productByEan = Object.fromEntries((byEan ?? []).filter(p => p.ean).map(p => [String(p.ean), p]))

      // Byg alle DB-operationer for batchen parallelt
      const ops: Promise<void>[] = []

      for (const p of batch) {
        const ean    = (p.EAN && String(p.EAN) !== '0') ? String(p.EAN) : null
        const skuStr = String(p.ItemId)
        const qty    = Number(p.InStock) || 0

        const description = formatDescription(p.PipedItemDetailsText)

        const categories: string[] = []
        if (p.CatParent) categories.push(String(p.CatParent))
        if (p.CatChild && p.CatChild !== p.CatParent) categories.push(String(p.CatChild))

        const supplierData = {
          supplier_id:             SUPPLIER_ID,
          supplier_sku:            skuStr,
          supplier_product_name:   p.Text || skuStr,
          purchase_price:          p.SalesPrice      > 0 ? p.SalesPrice      : null,
          recommended_sales_price: p.GrossSalesPrice > 0 ? p.GrossSalesPrice : null,
          supplier_stock_quantity: qty,
          supplier_stock_reserved: 0,
          item_status:             qty > 0 ? 'active' : 'out_of_stock',
          moq:                     1,
          supplier_images:         [],
          extra_data: {
            item_group:       p.ItemGroup  || null,
            disc_group:       p.DiscGroup  || null,
            description:      description,
            ean,
            height:           p.Height     > 0 ? p.Height  : null,
            length:           p.Length     > 0 ? p.Length  : null,
            width:            p.Width      > 0 ? p.Width   : null,
            net_weight:       p.NetWeight  > 0 ? p.NetWeight : null,
            categories,
            in_stock_expected: p.InStockExpected !== '1900-01-01' ? p.InStockExpected : null,
          },
          variant_id: null,
          is_active:  true,
        }

        const matchedProduct = ean ? (productByEan[ean] ?? null) : null
        processed++

        if (matchedProduct) {
          const existing = existingBySku[skuStr]
          if (existing) {
            updated++
            ops.push(Promise.resolve(
              supabase.from('product_suppliers')
                .update({
                  ...supplierData,
                  priority:                  existing.priority,
                  supplier_stock_updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
            ).then(({ error }) => { if (error) { console.error(`[columbus] update product_suppliers sku=${skuStr}:`, error.message, error.details); errors++; updated-- } }))
          } else {
            matched++
            ops.push(Promise.resolve(
              supabase.from('product_suppliers')
                .insert({ ...supplierData, product_id: matchedProduct.id, priority: 1 })
            ).then(({ error }) => { if (error) { console.error(`[columbus] insert product_suppliers sku=${skuStr}:`, error.message, error.details); errors++; matched-- } }))
          }
        } else {
          const stagingRow = existingStaging[skuStr]

          const rawData = {
            ...supplierData.extra_data,
            supplier_sku:            skuStr,
            supplier_product_name:   supplierData.supplier_product_name,
            purchase_price:          supplierData.purchase_price,
            recommended_sales_price: supplierData.recommended_sales_price,
            supplier_stock_quantity: qty,
          }

          if (stagingRow && stagingRow.status !== 'pending_review') {
            skipped++
            ops.push(Promise.resolve(
              supabase.from('supplier_product_staging')
                .update({ raw_data: rawData, updated_at: new Date().toISOString() })
                .eq('id', stagingRow.id)
            ).then(({ error }) => { if (error) { console.error(`[columbus] update staging sku=${skuStr}:`, error.message, error.details); errors++; skipped-- } }))
          } else {
            const stagingUpsertRow = {
              supplier_id:          SUPPLIER_ID,
              raw_data:             rawData,
              normalized_name:      p.Text || skuStr,
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
            ).then(({ error }) => { if (error) { console.error(`[columbus] upsert staging sku=${skuStr}:`, error.message, error.details); errors++; staged-- } }))
          }
        }
      }

      // Vent på alle DB-operationer i batchen parallelt
      await Promise.all(ops)

      onProgress({
        stage: 'importing', total, processed, matched, staged, updated, skipped, errors,
        message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} — ${matched} matchet, ${updated} opdateret, ${staged} til gennemgang`,
      })
    }

    await supabase.from('suppliers')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_state:     { ...(s.sync_state ?? {}), last_full_sync: new Date().toISOString() },
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
