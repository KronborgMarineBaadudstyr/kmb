// Betalingsleddet i checkout. Al udbyder-specifik kode samles her, når udbyderen er valgt
// (Stripe / Quickpay / Nets Easy / MobilePay): opret betaling → returnér udbyderens betalings-URL,
// og lad en callback-rute sætte orders.payment_status = 'paid'.

export type PaymentMethod = 'online' | 'pickup'

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; description: string }> = {
  online: { label: 'Betal online',           description: 'Kort eller MobilePay' },
  pickup: { label: 'Betal ved afhentning',   description: 'Betal i butikken når du henter varerne' },
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === 'online' || v === 'pickup'
}

// Slås til, når en betalingsudbyder er koblet på startPayment().
export function onlinePaymentAvailable(): boolean {
  return false
}

export type PaymentOrder = {
  id:           string
  order_number: string
  access_token: string
  order_total:  number
  email:        string
}

export async function startPayment(order: PaymentOrder): Promise<{ redirectUrl: string }> {
  return { redirectUrl: confirmationPath(order) }
}

export function confirmationPath(order: Pick<PaymentOrder, 'id' | 'access_token'>): string {
  return `/checkout/bekraeftelse/${order.id}?t=${encodeURIComponent(order.access_token)}`
}
