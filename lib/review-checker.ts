import { createServiceClient } from '@/lib/supabase/server'

export type ReviewReason = 'ikke_i_salg' | 'mangler_beskrivelse' | 'mangler_salgspris'

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  ikke_i_salg:         'Ikke i salg (ingen Woo/POS tilknytning)',
  mangler_beskrivelse:  'Mangler beskrivelse',
  mangler_salgspris:    'Mangler salgspris',
}

// Køres efter en leverandørimport for at flage matchede produkter der mangler data.
// Finder alle product_suppliers-rækker opdateret siden 'since', tjekker det linkede
// products-produkt for manglende data, og inserter/opdaterer staging-rækker med
// status 'needs_review'.
//
// Eksisterende staging-rækker med status 'rejected' eller 'new_product' berøres ikke
// (respekterer manuelle beslutninger).
export async function flagRecentlyImportedForReview(
  supplierId: string,
  since: Date,
  supabase: ReturnType<typeof createServiceClient>
): Promise<number> {
  // Hent nyligt opdaterede product_suppliers med linked product-data (pagineret)
  const allRows: Array<{
    supplier_sku:          string
    supplier_product_name: string | null
    product: {
      id:             string
      description:    string | null
      sales_price:    number | null
      woo_product_id: number | null
      pos_product_id: string | null
    } | null
  }> = []

  for (let p = 0; ; p++) {
    const { data } = await supabase
      .from('product_suppliers')
      .select('supplier_sku, supplier_product_name, product:products(id, description, sales_price, woo_product_id, pos_product_id)')
      .eq('supplier_id', supplierId)
      .gt('updated_at', since.toISOString())
      .range(p * 1000, p * 1000 + 999)
    if (!data || data.length === 0) break
    allRows.push(...(data as unknown as typeof allRows))
    if (data.length < 1000) break
  }

  if (allRows.length === 0) return 0

  // Find produkter der opfylder ≥1 review-kriterie
  const toFlag: Array<{
    supplier_sku:          string
    supplier_product_name: string
    product_id:            string
    reasons:               ReviewReason[]
  }> = []

  for (const row of allRows) {
    if (!row.product) continue
    const reasons: ReviewReason[] = []

    if (!row.product.woo_product_id && !row.product.pos_product_id)
      reasons.push('ikke_i_salg')
    if (!row.product.description)
      reasons.push('mangler_beskrivelse')
    if (!row.product.sales_price)
      reasons.push('mangler_salgspris')

    if (reasons.length > 0) {
      toFlag.push({
        supplier_sku:          row.supplier_sku,
        supplier_product_name: row.supplier_product_name ?? row.supplier_sku,
        product_id:            row.product.id,
        reasons,
      })
    }
  }

  if (toFlag.length === 0) return 0

  // Hent eksisterende staging-rækker for at respektere manuelle beslutninger
  const existingStaging: Record<string, { status: string }> = {}
  for (let p = 0; ; p++) {
    const { data } = await supabase
      .from('supplier_product_staging')
      .select('normalized_sku, status')
      .eq('supplier_id', supplierId)
      .range(p * 1000, p * 1000 + 999)
    if (!data || data.length === 0) break
    for (const r of data) existingStaging[r.normalized_sku] = r
    if (data.length < 1000) break
  }

  // Filtrer: rør ikke ved 'rejected' eller 'new_product' (manuelle beslutninger)
  const PROTECTED_STATUSES = new Set(['rejected', 'new_product'])
  const upsertRows = toFlag
    .filter(r => {
      const ex = existingStaging[r.supplier_sku]
      return !ex || !PROTECTED_STATUSES.has(ex.status)
    })
    .map(r => ({
      supplier_id:          supplierId,
      raw_data: {
        supplier_sku:          r.supplier_sku,
        supplier_product_name: r.supplier_product_name,
        review_reasons:        r.reasons,
      },
      normalized_name:      r.supplier_product_name,
      normalized_ean:       null,
      normalized_sku:       r.supplier_sku,
      normalized_unit:      null,
      normalized_unit_size: null,
      match_suggestions:    [],
      status:               'needs_review' as const,
      matched_product_id:   r.product_id,
      updated_at:           new Date().toISOString(),
    }))

  if (upsertRows.length === 0) return 0

  // Batch-upsert i chunks af 200
  for (let i = 0; i < upsertRows.length; i += 200) {
    await supabase
      .from('supplier_product_staging')
      .upsert(upsertRows.slice(i, i + 200), { onConflict: 'supplier_id,normalized_sku' })
  }

  return upsertRows.length
}
