// Pris på et produkt med varianter — uden "Fra"-priser.
//
// Produktets pris er dets egen salgspris; har det ingen, den pris flest varianter deler (ved uafgjort den laveste).
// En variant med en anden pris er i praksis en outlet-vare (restparti, udgående udgave): den tæller ikke i kortets pris
// og vises adskilt i variantvælgeren, hvor et klik åbner den som et selvstændigt produkt (?variant=<id>).
// Deler ingen varianter en pris (alle forskellige) og produktet har ingen egen pris, er der ingen outlet — så vises den laveste.

export type PricedVariant = { id: string; sales_price: number | null }

export type OutletSplit<T extends PricedVariant> = {
  reference: number | null   // prisen produktkortet og vælgeren viser
  regular:   T[]             // varianter til den almindelige vælger
  outlet:    T[]             // varianter med afvigende pris
}

export function splitOutlet<T extends PricedVariant>(variants: T[], basePrice: number | null | undefined): OutletSplit<T> {
  const priced = variants.filter(v => v.sales_price != null) as (T & { sales_price: number })[]
  const count  = new Map<number, number>()
  for (const v of priced) count.set(v.sales_price, (count.get(v.sales_price) ?? 0) + 1)
  const mode = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]   // flest → ved uafgjort laveste
  const reference = basePrice ?? mode?.[0] ?? null

  if (reference == null) return { reference: null, regular: variants, outlet: [] }

  const outlet  = priced.filter(v => v.sales_price !== reference)
  const regular = variants.filter(v => !outlet.includes(v as T & { sales_price: number }))
  const shared  = count.get(reference) ?? 0

  // Ingen reel "normalpris" at måle mod → ingen outlet
  if (regular.length === 0 || (basePrice == null && shared < 2)) {
    const lowest = priced.length ? Math.min(...priced.map(v => v.sales_price)) : null
    return { reference: basePrice ?? lowest, regular: variants, outlet: [] }
  }
  return { reference, regular, outlet }
}

export const attrLabel = (attributes: { name: string; value: string }[] | null | undefined, fallback = '') =>
  (attributes ?? []).map(a => a.value).filter(Boolean).join(' / ') || fallback
