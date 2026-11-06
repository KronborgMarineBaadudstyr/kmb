// Betalingsleddet i checkout. Al udbyder-specifik kode samles her, når udbyderen er valgt
// (Stripe / Quickpay / Nets Easy / MobilePay): opret betaling → returnér udbyderens betalings-URL,
// og lad en callback-rute sætte orders.payment_status = 'paid'.

export type PaymentOrder = {
  id:           string
  order_number: string
  access_token: string
  order_total:  number
  email:        string
}

export async function startPayment(order: PaymentOrder): Promise<{ redirectUrl: string }> {
  // Ingen betalingsudbyder endnu: ordren står som 'unpaid', og kunden sendes direkte til kvitteringen.
  return { redirectUrl: confirmationPath(order) }
}

export function confirmationPath(order: Pick<PaymentOrder, 'id' | 'access_token'>): string {
  return `/checkout/bekraeftelse/${order.id}?t=${encodeURIComponent(order.access_token)}`
}
