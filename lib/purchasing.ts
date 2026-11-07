import { createServiceClient } from '@/lib/supabase/server'

// Indkøbsliste: varer på åbne ordrer, der ikke kunne reserveres på eget lager,
// samlet pr. vare og fordelt på leverandør.
//
// Leverandørvalg pr. vare (kun aktive, ikke udgåede — medmindre der ikke er andre):
//   1) foretrukket leverandør (priority = 1)
//   2) ellers laveste indkøbspris for det, der skal bestilles (pris × max(antal, minimumsordre))
// Kandidater: rækker på varianten → rækker på produktet → for varianter i en variantfamilie:
// det oprindelige produkt med samme EAN (variant_of_product_id = overproduktet).

export type PurchaseLine = {
  key:            string
  product_id:     string
  variant_id:     string | null
  name:           string
  sku:            string
  ean:            string | null
  missing:        number          // mangler til ordrer
  order_qty:      number          // max(mangler, leverandørens minimumsordre)
  orders:         string[]        // ordrenumre
  supplier_sku:   string | null
  purchase_price: number | null
  supplier_stock: number | null
  moq:            number
  reason:         'preferred' | 'cheapest' | 'only' | null
}

export type PurchaseGroup = {
  supplier_id:   string | null
  supplier_name: string
  contact_email: string | null
  lines:         PurchaseLine[]
  total:         number            // indkøbsværdi ekskl. moms (linjer med kendt pris)
}

type Line  = { product_id?: string; variant_id?: string | null; name?: string; sku?: string; qty?: number; reserved_qty?: number }
type PS    = {
  id: string; product_id: string; variant_id: string | null; priority: number; is_active: boolean; item_status: string
  supplier_sku: string; purchase_price: number | null; supplier_stock_quantity: number; moq: number
  suppliers: { id: string; name: string; contact_email: string | null } | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function chunks<T>(arr: T[], n = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function choose(cands: PS[], missing: number): { ps: PS; reason: PurchaseLine['reason'] } | null {
  const usable = cands.filter(c => c.is_active && c.item_status !== 'discontinued' && c.suppliers)
  const pool   = usable.length ? usable : cands.filter(c => c.suppliers)
  if (pool.length === 0) return null
  if (pool.length === 1) return { ps: pool[0], reason: 'only' }
  const preferred = pool.find(c => c.priority === 1)
  if (preferred) return { ps: preferred, reason: 'preferred' }
  const cost = (c: PS) => c.purchase_price == null ? Infinity : c.purchase_price * Math.max(missing, c.moq || 1)
  const cheapest = [...pool].sort((a, b) => cost(a) - cost(b) || a.priority - b.priority)[0]
  return { ps: cheapest, reason: 'cheapest' }
}

export async function buildPurchaseList(): Promise<{ groups: PurchaseGroup[]; error: string | null }> {
  const supabase = createServiceClient()

  const { data: orders, error } = await supabase.from('orders')
    .select('order_number, line_items')
    .eq('stock_state', 'reserved')
    .not('status', 'in', '(completed,cancelled)')
    .limit(2000)
  if (error) return { groups: [], error: error.message }

  // Saml manglende antal pr. vare
  const need = new Map<string, { product_id: string; variant_id: string | null; name: string; sku: string; missing: number; orders: Set<string> }>()
  for (const o of orders ?? []) {
    for (const l of (Array.isArray(o.line_items) ? o.line_items : []) as Line[]) {
      const pid = l.product_id && UUID.test(l.product_id) ? l.product_id : null
      const vid = l.variant_id && UUID.test(l.variant_id) ? l.variant_id : null
      const missing = Math.max(0, (Number(l.qty) || 0) - (Number(l.reserved_qty) || 0))
      if (!pid || missing === 0) continue
      const key = `${pid}__${vid ?? ''}`
      const n = need.get(key) ?? { product_id: pid, variant_id: vid, name: l.name ?? '', sku: l.sku ?? '', missing: 0, orders: new Set<string>() }
      n.missing += missing
      if (o.order_number) n.orders.add(o.order_number)
      need.set(key, n)
    }
  }
  if (need.size === 0) return { groups: [], error: null }

  const productIds = [...new Set([...need.values()].map(n => n.product_id))]
  const variantIds = [...new Set([...need.values()].map(n => n.variant_id).filter((v): v is string => !!v))]

  const variantEans = new Map<string, string | null>()
  for (const ids of chunks(variantIds)) {
    const { data } = await supabase.from('product_variants').select('id, ean').in('id', ids)
    for (const v of data ?? []) variantEans.set(v.id, v.ean)
  }
  const productEans = new Map<string, string | null>()
  for (const ids of chunks(productIds)) {
    const { data } = await supabase.from('products').select('id, ean').in('id', ids)
    for (const p of data ?? []) productEans.set(p.id, p.ean)
  }

  // Oprindelige produkter i variantfamilier (til varianter uden egne leverandørrækker)
  const absorbedByEan = new Map<string, string>()   // `${parentId}|${ean}` → original product id
  for (const ids of chunks(productIds)) {
    const { data } = await supabase.from('products').select('id, ean, variant_of_product_id')
      .in('variant_of_product_id', ids).not('ean', 'is', null)
    for (const p of data ?? []) absorbedByEan.set(`${p.variant_of_product_id}|${p.ean}`, p.id)
  }

  const psProductIds = [...new Set([...productIds, ...absorbedByEan.values()])]
  const psRows: PS[] = []
  for (const ids of chunks(psProductIds)) {
    const { data } = await supabase.from('product_suppliers')
      .select('id, product_id, variant_id, priority, is_active, item_status, supplier_sku, purchase_price, supplier_stock_quantity, moq, suppliers ( id, name, contact_email )')
      .in('product_id', ids)
    psRows.push(...((data ?? []) as unknown as PS[]))
  }

  const groups = new Map<string, PurchaseGroup>()
  for (const [key, n] of need) {
    let cands = n.variant_id ? psRows.filter(r => r.variant_id === n.variant_id) : []
    if (!cands.length) cands = psRows.filter(r => r.product_id === n.product_id && !r.variant_id)
    if (!cands.length && !n.variant_id) cands = psRows.filter(r => r.product_id === n.product_id)
    const ean = n.variant_id ? variantEans.get(n.variant_id) ?? null : productEans.get(n.product_id) ?? null
    if (!cands.length && n.variant_id && ean) {
      const original = absorbedByEan.get(`${n.product_id}|${ean}`)
      if (original) cands = psRows.filter(r => r.product_id === original)
    }

    const pick = choose(cands, n.missing)
    const ps   = pick?.ps ?? null
    const moq  = ps?.moq && ps.moq > 1 ? ps.moq : 1
    const line: PurchaseLine = {
      key, product_id: n.product_id, variant_id: n.variant_id, name: n.name, sku: n.sku, ean,
      missing: n.missing, order_qty: Math.max(n.missing, moq), orders: [...n.orders].sort(),
      supplier_sku: ps?.supplier_sku ?? null, purchase_price: ps?.purchase_price ?? null,
      supplier_stock: ps ? ps.supplier_stock_quantity : null, moq, reason: pick?.reason ?? null,
    }

    const gid = ps?.suppliers?.id ?? 'none'
    const g = groups.get(gid) ?? {
      supplier_id:   ps?.suppliers?.id ?? null,
      supplier_name: ps?.suppliers?.name ?? 'Ingen leverandør fundet',
      contact_email: ps?.suppliers?.contact_email ?? null,
      lines: [], total: 0,
    }
    g.lines.push(line)
    if (line.purchase_price != null) g.total += line.purchase_price * line.order_qty
    groups.set(gid, g)
  }

  const sorted = [...groups.values()]
    .map(g => ({ ...g, total: Math.round(g.total * 100) / 100, lines: g.lines.sort((a, b) => a.name.localeCompare(b.name, 'da')) }))
    .sort((a, b) => (a.supplier_id ? 0 : 1) - (b.supplier_id ? 0 : 1) || a.supplier_name.localeCompare(b.supplier_name, 'da'))
  return { groups: sorted, error: null }
}

// Semikolon-separeret med BOM, så Excel (dansk) åbner den korrekt
export function purchaseCsv(group: PurchaseGroup): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const num = (n: number | null) => n == null ? '' : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const rows = [
    ['Leverandør varenr.', 'EAN', 'Varenavn', 'Antal', 'Indkøbspris', 'Vores varenr.', 'Ordrer'],
    ...group.lines.map(l => [l.supplier_sku, l.ean, l.name, l.order_qty, num(l.purchase_price), l.sku, l.orders.join(', ')]),
  ]
  return '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n') + '\r\n'
}
