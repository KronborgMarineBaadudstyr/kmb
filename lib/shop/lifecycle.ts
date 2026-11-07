// Fælles for kundens kontoside, admin-oversigten og påmindelsesmails.

export type LifecycleRow = {
  shop_user_id: string
  email: string | null
  phone: string | null
  customer_name: string | null
  marketing_opt_in: boolean
  order_id: string
  order_number: string | null
  purchased_at: string
  product_id: string
  shop_product_id: string
  line_name: string
  qty: number
  lifespan_months: number
  lifespan_note: string | null
  due_date: string
  image_url: string | null
  reminded_at: string | null
}

export const LIFECYCLE_COLUMNS =
  'shop_user_id, email, phone, customer_name, marketing_opt_in, order_id, order_number, purchased_at, ' +
  'product_id, shop_product_id, line_name, qty, lifespan_months, lifespan_note, due_date, image_url, reminded_at'

export type DueTone = 'overdue' | 'soon' | 'later'

const DAY = 86400_000

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(days: number, from = new Date()): string {
  return isoDate(new Date(from.getTime() + days * DAY))
}

// "Forfalden for 3 mdr. siden" / "Om 12 dage" / "Om 5 mdr."
export function dueStatus(dueDate: string, today = new Date()): { label: string; tone: DueTone } {
  const days = Math.round((new Date(dueDate + 'T00:00:00').getTime() - new Date(isoDate(today) + 'T00:00:00').getTime()) / DAY)
  if (days < 0) {
    const ago = -days
    return { tone: 'overdue', label: ago < 45 ? `Forfalden for ${ago} dage siden` : `Forfalden for ${Math.round(ago / 30.4)} mdr. siden` }
  }
  if (days === 0) return { tone: 'overdue', label: 'Forfalder i dag' }
  return { tone: days <= 90 ? 'soon' : 'later', label: days < 45 ? `Om ${days} dage` : `Om ${Math.round(days / 30.4)} mdr.` }
}

export function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function lifespanLabel(months: number): string {
  if (months % 12 === 0) return `${months / 12} år`
  if (months > 12) return `${months} mdr. (≈ ${(months / 12).toLocaleString('da-DK', { maximumFractionDigits: 1 })} år)`
  return `${months} mdr.`
}
