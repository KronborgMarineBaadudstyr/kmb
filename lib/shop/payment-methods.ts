// Betalingsformer og stier — uden server-kode, så checkout-formularen (browseren) kan importere dem.
// Selve betalingen (Swedbank Pay) ligger i lib/shop/payment.ts.

export type PaymentMethod = 'online' | 'pickup'

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; description: string }> = {
  online: { label: 'Betal online',           description: 'Kort eller MobilePay' },
  pickup: { label: 'Betal ved afhentning',   description: 'Betal i butikken når du henter varerne' },
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === 'online' || v === 'pickup'
}

export type PaymentOrder = {
  id:           string
  order_number: string
  access_token: string
  order_total:  number
  email:        string
}

export function confirmationPath(order: Pick<PaymentOrder, 'id' | 'access_token'>): string {
  return `/checkout/bekraeftelse/${order.id}?t=${encodeURIComponent(order.access_token)}`
}

// Hvor kunden lander efter betalingsvinduet (både gennemført og afbrudt) — siden henter selv status
export function paymentReturnPath(order: Pick<PaymentOrder, 'id' | 'access_token'>, cancelled = false): string {
  return `/checkout/betaling/${order.id}?t=${encodeURIComponent(order.access_token)}${cancelled ? '&afbrudt=1' : ''}`
}

