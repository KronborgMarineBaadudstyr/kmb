import { createWooClient } from './client'
import { createServiceClient } from '../supabase/server'
import type { WooProduct, WooVariation } from '@/types'

export type ImportProgress = {
  stage: 'fetching' | 'importing' | 'variants' | 'done' | 'error'
  total: number
  processed: number
  errors: number
  page: number
  totalPages: number
  message: string
}

type ProgressCallback = (progress: ImportProgress) => void

// ── Mapping: WooCommerce produkt → Supabase products tabel ──
function mapProduct(p: WooProduct) {
  const meta: Record<string, unknown> = {}
  for (const m of p.meta_data) meta[m.key] = m.value

  // Manualer: ACF repeater — gem som jsonb på product_files via separate tabel (næste fase)
  // Her gemmer vi dem blot i specifications som rådata
  const manualer = meta['manualer'] ?? null

  const specs: Record<string, unknown> = {}
  if (meta['specifikationer']) specs['specifikationer'] = meta['specifikationer']
  if (manualer) specs['manualer'] = manualer

  return {
    internal_sku:          p.sku?.trim() || `woo-${p.id}`,
    name:                  p.name,
    description:           p.description   || null,
    short_description:     p.short_description || null,
    manufacturer_sku:      null,  // udfyldes ved leverandørimport
    own_stock_quantity:    p.manage_stock ? (p.stock_quantity ?? 0) : 0,
    own_stock_reserved:    0,
    sales_price:           p.regular_price ? parseFloat(p.regular_price) : null,
    sale_price:            p.sale_price    ? parseFloat(p.sale_price)    : null,
    weight:                p.weight        ? parseFloat(p.weight)        : null,
    length:                p.dimensions?.length ? parseFloat(p.dimensions.length) : null,
    width:                 p.dimensions?.width  ? parseFloat(p.dimensions.width)  : null,
    height:                p.dimensions?.height ? parseFloat(p.dimensions.height) : null,
    categories:            p.categories.map(c => c.name),
    tags:                  p.tags.map(t => t.name),
    // Ikke-variation attributter
    attributes:            p.attributes.filter(a => !a.variation).map(a => ({
                             name: a.name,
                             value: a.options,
                           })),
    brand:                 (p as WooProduct & { brands?: {name:string}[] }).brands?.[0]?.name ?? null,
    slug:                  p.slug || null,
    ean:                   (meta['_alg_ean'] as string) || null,
    specifications:        Object.keys(specs).length ? specs : null,
    woo_product_id:        p.id,
    woo_bestillingsnummer: (meta['bestillingsnummer'] as string) || null,
    status:                'validated' as const,
    woo_sync_status:       'synced',
  }
}

// ── Mapping: WooCommerce variation → Supabase product_variants tabel ──
function mapVariant(v: WooVariation, productId: string) {
  const meta: Record<string, unknown> = {}
  for (const m of v.meta_data) meta[m.key] = m.value

  return {
    product_id:            productId,
    internal_variant_sku:  v.sku?.trim() || `woo-var-${v.id}`,
    attributes:            v.attributes.map(a => ({ name: a.name, value: a.option })),
    own_stock_quantity:    v.manage_stock ? (v.stock_quantity ?? 0) : 0,
    own_stock_reserved:    0,
    sales_price:           v.regular_price ? parseFloat(v.regular_price) : null,
    sale_price:            v.sale_price    ? parseFloat(v.sale_price)    : null,
    ean:                   (meta['_alg_ean'] as string) || null,
    woo_variation_id:      v.id,
    status:                'active' as const,
  }
}

// ── Hoved-importfunktion ──
export async function importWooProducts(
  onProgress: ProgressCallback,
  options: { limit?: number } = {}
): Promise<void> {
  const woo      = createWooClient()
  const supabase = createServiceClient()

  // 1. Hent totalt antal
  onProgress({ stage: 'fetching', total: 0, processed: 0, errors: 0, page: 0, totalPages: 0,
    message: 'Kontakter WooCommerce...' })

  const countResp  = await woo.get('products', { per_page: 1, status: 'any' })
  const total      = Math.min(
    parseInt((countResp.headers as Record<string,string>)['x-wp-total'] || '0', 10),
    options.limit ?? Infinity
  )
  const totalPages = options.limit
    ? Math.ceil(options.limit / 100)
    : parseInt((countResp.headers as Record<string,string>)['x-wp-totalpages'] || '1', 10)

  onProgress({ stage: 'fetching', total, processed: 0, errors: 0, page: 0, totalPages,
    message: `${total.toLocaleString('da-DK')} produkter fundet — starter import...` })

  let page      = 1
  let processed = 0
  let errors    = 0
  const variableProductIds: { wooId: number; dbId: string }[] = []

  // 2. Importer side for side
  while (page <= totalPages) {
    const resp     = await woo.get('products', { per_page: 100, page, status: 'any' })
    const products = resp.data as WooProduct[]

    // ── Pre-step: ret SKU-drift (varenr. er ændret i Woo siden sidst) ──
    // Hvis et produkt skiftede SKU i Woo, ville en naiv upsert på internal_sku
    // skabe et duplikat. Vi korrigerer internal_sku for eksisterende rækker
    // baseret på woo_product_id, så den efterfølgende upsert rammer rigtigt.
    const wooIds = products.map(p => p.id)
    const { data: existingByWooId } = await supabase
      .from('products')
      .select('id, internal_sku, woo_product_id')
      .in('woo_product_id', wooIds)

    for (const existing of existingByWooId ?? []) {
      const wooP   = products.find(p => p.id === existing.woo_product_id)
      if (!wooP) continue
      const newSku = wooP.sku?.trim() || `woo-${wooP.id}`
      if (existing.internal_sku !== newSku) {
        await supabase
          .from('products')
          .update({ internal_sku: newSku })
          .eq('id', existing.id)
      }
    }

    // ── Batch upsert produkter (idempotent via internal_sku UNIQUE) ──
    const rows = products.map(mapProduct)

    const { error: upsertErr } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'internal_sku', ignoreDuplicates: false })

    if (upsertErr) {
      // Fallback: upsert én ad gangen for at isolere problemet
      for (const row of rows) {
        const { error } = await supabase
          .from('products')
          .upsert(row, { onConflict: 'internal_sku' })
        if (error) errors++
      }
    }

    // ── Hent Supabase ID'er tilbage for at linke billeder ──
    const skus = products.map(p => p.sku?.trim() || `woo-${p.id}`)
    const { data: dbRows } = await supabase
      .from('products')
      .select('id, internal_sku, woo_product_id')
      .in('internal_sku', skus)

    const skuToId: Record<string, string> = {}
    for (const r of dbRows ?? []) skuToId[r.internal_sku] = r.id

    // ── Batch insert billeder ──
    const imageRows: object[] = []
    for (const p of products) {
      const dbId = skuToId[p.sku?.trim() || `woo-${p.id}`]
      if (!dbId || !p.images.length) continue
      p.images.forEach((img, idx) => {
        imageRows.push({
          product_id: dbId,
          url:        img.src,
          alt_text:   img.alt || null,
          position:   idx,
          is_primary: idx === 0,
          source:     'woo',
        })
      })
    }

    if (imageRows.length) {
      const dbIds = Object.values(skuToId)
      await supabase.from('product_images').delete().in('product_id', dbIds).eq('source', 'woo')
      await supabase.from('product_images').insert(imageRows)
    }

    // ── Registrér variable produkter til efterbehandling ──
    for (const p of products) {
      if (p.type === 'variable' && p.variations.length > 0) {
        const dbId = skuToId[p.sku?.trim() || `woo-${p.id}`]
        if (dbId) variableProductIds.push({ wooId: p.id, dbId })
      }
    }

    processed += products.length
    onProgress({
      stage: 'importing', total, processed, errors, page, totalPages,
      message: `Side ${page}/${totalPages} — ${processed.toLocaleString('da-DK')} af ${total.toLocaleString('da-DK')} importeret`,
    })

    page++
  }

  // 3. Importer varianter for variable produkter
  if (variableProductIds.length > 0) {
    onProgress({
      stage: 'variants', total, processed, errors, page: totalPages, totalPages,
      message: `Importerer varianter for ${variableProductIds.length} variable produkter...`,
    })

    for (const { wooId, dbId } of variableProductIds) {
      try {
        const varResp  = await woo.get(`products/${wooId}/variations`, { per_page: 100 })
        const variants = varResp.data as WooVariation[]
        const varRows  = variants.map(v => mapVariant(v, dbId))

        await supabase
          .from('product_variants')
          .upsert(varRows, { onConflict: 'internal_variant_sku' })
      } catch {
        errors++
      }
    }
  }

  // 4. Færdig
  onProgress({
    stage: 'done', total, processed, errors, page: totalPages, totalPages,
    message: `Færdig! ${processed.toLocaleString('da-DK')} produkter importeret · ${variableProductIds.length} variable · ${errors} fejl`,
  })
}
