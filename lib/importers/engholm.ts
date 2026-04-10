import { createServiceClient } from '@/lib/supabase/server'

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
  stage:     'fetching' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  created:   number
  updated:   number
  errors:    number
  message:   string
}

type ProgressCallback = (p: EngholmImportProgress) => void

// Decode HTML entities (&#229; → å osv.)
function decode(str: string): string {
  return str
    .replace(/&#229;/g, 'å').replace(/&#230;/g, 'æ').replace(/&#248;/g, 'ø')
    .replace(/&#197;/g, 'Å').replace(/&#198;/g, 'Æ').replace(/&#216;/g, 'Ø')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
}

function decodeDetails(details: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(details)) out[decode(k)] = decode(String(v))
  return out
}

// Byg categories array fra Engholms kategori-sti
function parseCategories(cat: string): string[] {
  if (!cat) return []
  return cat.split('>').map(c => c.trim()).filter(Boolean)
}

export async function importEngholm(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const supabase = createServiceClient()

  onProgress({ stage: 'fetching', total: 0, processed: 0, created: 0, updated: 0, errors: 0,
    message: 'Henter produkter fra Engholm API...' })

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
  onProgress({ stage: 'importing', total, processed: 0, created: 0, updated: 0, errors: 0,
    message: `${total.toLocaleString('da-DK')} produkter hentet — starter import...` })

  // ── 2. Hent eksisterende product_suppliers for Engholm ──
  const { data: existing } = await supabase
    .from('product_suppliers')
    .select('id, supplier_sku, product_id')
    .eq('supplier_id', SUPPLIER_ID)

  const existingBySku = Object.fromEntries((existing ?? []).map(r => [r.supplier_sku, r]))

  // ── 3. Importer i batches af 200 ──
  const BATCH = 200
  let processed = 0, created = 0, updated = 0, errors = 0

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)

    // ── Upsert product_suppliers (leverandørdata — altid) ──
    const supplierRows = batch.map(p => ({
      supplier_id:              SUPPLIER_ID,
      // product_id sættes til NULL for nu — matches op mod products via sku-matching bagefter
      product_id:               null as unknown as string,
      supplier_sku:             p.sku,
      supplier_product_name:    decode(p.title),
      purchase_price:           p.price   > 0 ? p.price   : null,
      recommended_sales_price:  p.retail  > 0 ? p.retail  : null,
      supplier_stock_quantity:  p.stock   ?? 0,
      item_status:              p.stock > 0 ? 'active' : 'out_of_stock',
      supplier_images:          p.image ? [{ url: p.image, alt: decode(p.title), is_primary: true }] : [],
      extra_data: {
        gtin:          p.gtin         || null,
        nautiskVarenr: p.nautiskVarenr || null,
        grouping:      p.grouping      || null,
        unit:          p.unit          || null,
        description:   decode(p.description || ''),
        category:      decode(p.category    || ''),
        lastUpdate:    p.lastUpdate    || null,
        details:       decodeDetails(p.details ?? {}),
      },
      priority:    99, // sættes korrekt når produktet matches
      is_active:   true,
    }))

    // Fjern rækker uden product_id fra direkte upsert —
    // gem dem i en separat staging-struktur eller match mod products
    // ── Match mod eksisterende produkter via EAN (gtin) eller SKU ──
    const gtins = batch.map(p => p.gtin).filter(Boolean)
    const skus   = batch.map(p => p.sku).filter(Boolean)

    const [{ data: byEan }, { data: bySku }] = await Promise.all([
      gtins.length > 0
        ? supabase.from('products').select('id, ean, manufacturer_sku').in('ean', gtins)
        : Promise.resolve({ data: [] }),
      skus.length > 0
        ? supabase.from('products').select('id, ean, manufacturer_sku').in('manufacturer_sku', skus)
        : Promise.resolve({ data: [] }),
    ])

    const productByEan = Object.fromEntries((byEan ?? []).filter(p => p.ean).map(p => [p.ean, p.id]))
    const productBySku = Object.fromEntries((bySku ?? []).filter(p => p.manufacturer_sku).map(p => [p.manufacturer_sku, p.id]))

    for (const p of batch) {
      const productId = productByEan[p.gtin] ?? productBySku[p.sku] ?? null

      const row = {
        supplier_id:              SUPPLIER_ID,
        product_id:               productId,
        variant_id:               null,
        supplier_sku:             p.sku,
        supplier_product_name:    decode(p.title),
        purchase_price:           p.price  > 0 ? p.price  : null,
        recommended_sales_price:  p.retail > 0 ? p.retail : null,
        supplier_stock_quantity:  p.stock  ?? 0,
        item_status:              p.stock > 0 ? 'active' : 'out_of_stock',
        supplier_images:          p.image ? [{ url: p.image, alt: decode(p.title), is_primary: true }] : [],
        extra_data: {
          gtin:          p.gtin          || null,
          nautiskVarenr: p.nautiskVarenr || null,
          grouping:      p.grouping       || null,
          unit:          p.unit           || null,
          description:   decode(p.description || ''),
          category:      decode(p.category    || ''),
          categories:    parseCategories(decode(p.category || '')),
          lastUpdate:    p.lastUpdate     || null,
          details:       decodeDetails(p.details ?? {}),
        },
        priority:    1,
        is_active:   true,
      }

      if (!productId) {
        // Ingen match — gem uden product_id i et rådata-format
        // Vi lader product_id være NULL og markerer det til manuel godkendelse
        // (product_id har NOT NULL constraint — skip disse for nu, vis dem i UI)
        // TODO: opret draft-produkter automatisk i næste fase
        // processed++
        // continue
      }

      if (productId) {
        const existingRow = existingBySku[p.sku]
        if (existingRow) {
          await supabase.from('product_suppliers').update(row).eq('id', existingRow.id)
          updated++
        } else {
          const { error } = await supabase.from('product_suppliers').insert(row)
          if (error) errors++
          else created++
        }
      }

      processed++
    }

    // Opdater leverandørens last_synced_at
    await supabase
      .from('suppliers')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', SUPPLIER_ID)

    onProgress({
      stage: 'importing', total, processed, created, updated, errors,
      message: `${processed.toLocaleString('da-DK')} / ${total.toLocaleString('da-DK')} behandlet — ${created} nye, ${updated} opdateret`,
    })
  }

  onProgress({
    stage: 'done', total, processed, created, updated, errors,
    message: `Færdig! ${processed.toLocaleString('da-DK')} produkter — ${created} nye tilknytninger, ${updated} opdateret, ${errors} fejl`,
  })
}
