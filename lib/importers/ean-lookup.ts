/**
 * ean-lookup.ts
 *
 * Variant-aware EAN lookup.
 *
 * Problem: products oprettet fra variant-grupper har products.ean = null
 * (EAN sidder på product_variants.ean). Alle importere skal bruge denne
 * helper i stedet for direkte products.ean-opslag, ellers opdateres
 * stok/pris aldrig på variant-produkter efter første oprettelse.
 *
 * Prioritet:
 *  1. products.ean                — simpelt produkt, direkte match
 *  2. product_variants.ean        — variant-produkt, returner (productId, variantId)
 */

import { createServiceClient } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createServiceClient>

export type EanMatch = {
  productId:   string
  variantId:   string | null   // null = simpelt produkt, uuid = specifik variant
  productName: string | null
}

/**
 * Slå op til N EAN-numre op i ét kald.
 * Returnerer et map: ean → { productId, variantId | null }.
 *
 * Tjekker products.ean først; for ukendte EAN tjekkes product_variants.ean.
 *
 * EAN'er i supplier_ean_exclusions for den givne leverandør springes over —
 * de er dokumenteret forkerte og skal ikke bruges til matching.
 */
export async function batchEanLookup(
  supabase:    Supabase,
  eans:        string[],
  supplierId?: string,   // hvis angivet, filtreres kendte fejl-EAN fra
): Promise<Record<string, EanMatch>> {
  const result: Record<string, EanMatch> = {}
  if (eans.length === 0) return result

  // 0. Filtrer kendte fejl-EAN for denne leverandør fra
  let lookupEans = eans
  if (supplierId && eans.length > 0) {
    const { data: excluded } = await supabase
      .from('supplier_ean_exclusions')
      .select('ean')
      .eq('supplier_id', supplierId)
      .in('ean', eans)
    if (excluded && excluded.length > 0) {
      const excludedSet = new Set((excluded as { ean: string }[]).map(r => r.ean))
      lookupEans = eans.filter(e => !excludedSet.has(e))
    }
  }
  if (lookupEans.length === 0) return result

  // 1. Direkte produkt-match (products.ean)
  const { data: byProduct } = await supabase
    .from('products')
    .select('id, name, ean')
    .in('ean', lookupEans)

  for (const p of (byProduct ?? []) as { id: string; name: string; ean: string }[]) {
    if (p.ean) result[p.ean] = { productId: p.id, variantId: null, productName: p.name }
  }

  // 2. Variant-match (product_variants.ean → parent product)
  const unmatched = lookupEans.filter(e => !result[e])
  if (unmatched.length > 0) {
    const { data: byVariant } = await supabase
      .from('product_variants')
      .select('id, ean, product_id, products(name)')
      .in('ean', unmatched)

    for (const v of (byVariant ?? []) as {
      id: string; ean: string; product_id: string
      products: { name: string } | null
    }[]) {
      if (v.ean && !result[v.ean]) {
        result[v.ean] = {
          productId:   v.product_id,
          variantId:   v.id,
          productName: v.products?.name ?? null,
        }
      }
    }
  }

  return result
}
