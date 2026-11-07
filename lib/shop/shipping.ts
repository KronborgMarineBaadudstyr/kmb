// Fælles for kurv (klient) og ordre-API (server), så viste og opkrævede beløb altid matcher.

export const FREE_SHIPPING_THRESHOLD = 499
export const DELIVERY_COST           = 49

export type ShippingMethod = 'delivery' | 'pickup'

export const SHIPPING_METHODS: Record<ShippingMethod, { label: string; description: string }> = {
  delivery: { label: 'Levering med pakke', description: `Gratis fra ${FREE_SHIPPING_THRESHOLD} kr` },
  pickup:   { label: 'Afhentning i butikken', description: 'Gratis — vi giver besked når varerne er klar' },
}

export function shippingCost(subtotal: number, method: ShippingMethod): number {
  if (method === 'pickup') return 0
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DELIVERY_COST
}

export function isShippingMethod(v: unknown): v is ShippingMethod {
  return v === 'delivery' || v === 'pickup'
}
