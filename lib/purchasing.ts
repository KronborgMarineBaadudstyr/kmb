import { createServiceClient } from '@/lib/supabase/server'

// Indkøbsliste: varer på åbne ordrer, der ikke kunne reserveres på eget lager,
// samlet pr. vare og fordelt på leverandør.
//
// Leverandørvalg pr. vare (kun aktive, ikke udgåede — medmindre der ikke er andre):
//   1) foretrukket leverandør (priority = 1)
//   2) ellers laveste indkøbspris for det, der skal bestilles (pris × max(antal, minimumsordre))
// Kandidater: rækker på varianten → rækker på produktet → for varianter i en variantfamilie:
// det oprindelige produkt med samme EAN (variant_of_product_id = overproduktet).
//
// Bestilt: "Markér som bestilt" skriver en post i line_items[].ordered på hver berørt ordrelinje
// (reference, antal, leverandør, tidspunkt, admin). Det bestilte trækkes fra det manglende antal.
// order_stock_apply bevarer øvrige felter på linjerne, så reservation og bestilling lever side om side.

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
  sources:        { order_id: string; order_number: string | null; index: number; product_id: string; missing: number }[]
}

export type PurchaseCustomer = { name?: string; email?: string; phone?: string; address?: string; postcode?: string; city?: string }

// Samme bestilling set pr. ordre — så varen kan bestilles med levering direkte til kunden (dropshipping)
export type PurchaseOrder = {
  order_id:        string
  order_number:    string | null
  ordered_at:      string | null
  shipping_method: string | null       // 'delivery' = sendes til kunden, 'pickup' = afhentes i butikken
  customer:        PurchaseCustomer
  note:            string | null
  lines:           { name: string; sku: string; supplier_sku: string | null; qty: number; purchase_price: number | null }[]
}

export type PurchaseGroup = {
  supplier_id:   string | null
  supplier_name: string
  contact_email: string | null
  lines:         PurchaseLine[]
  orders:        PurchaseOrder[]   // de samme varer fordelt på ordrer (nyeste først)
  total:         number            // indkøbsværdi ekskl. moms (linjer med kendt pris)
}

export type OrderedEntry = { ref: string; qty: number; supplier_id: string; supplier_name: string; at: string; by: string }
type Line  = { product_id?: string; variant_id?: string | null; name?: string; sku?: string; qty?: number; reserved_qty?: number; ordered?: OrderedEntry[] }

export const orderedQty = (l: { ordered?: OrderedEntry[] }) =>
  (Array.isArray(l.ordered) ? l.ordered : []).reduce((s, e) => s + (Number(e.qty) || 0), 0)
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
    .select('id, order_number, line_items, customer_info, email, shipping_method, ordered_at, customer_note')
    .eq('stock_state', 'reserved')
    .not('status', 'in', '(completed,cancelled)')
    .limit(2000)
  if (error) return { groups: [], error: error.message }

  // Saml manglende antal pr. vare
  type Need = { product_id: string; variant_id: string | null; name: string; sku: string; missing: number
                orders: Set<string>; sources: PurchaseLine['sources'] }
  const need = new Map<string, Need>()
  const orderInfo = new Map<string, Omit<PurchaseOrder, 'lines'>>()
  for (const o of orders ?? []) {
    const c = (o.customer_info ?? {}) as PurchaseCustomer
    orderInfo.set(o.id, {
      order_id: o.id, order_number: o.order_number, ordered_at: o.ordered_at ?? null,
      shipping_method: o.shipping_method ?? null, note: o.customer_note ?? null,
      customer: { ...c, email: c.email ?? o.email ?? undefined },
    })
    const lines = (Array.isArray(o.line_items) ? o.line_items : []) as Line[]
    lines.forEach((l, index) => {
      const pid = l.product_id && UUID.test(l.product_id) ? l.product_id : null
      const vid = l.variant_id && UUID.test(l.variant_id) ? l.variant_id : null
      const missing = Math.max(0, (Number(l.qty) || 0) - (Number(l.reserved_qty) || 0) - orderedQty(l))
      if (!pid || missing === 0) return
      const key = `${pid}__${vid ?? ''}`
      const n = need.get(key) ?? { product_id: pid, variant_id: vid, name: l.name ?? '', sku: l.sku ?? '', missing: 0, orders: new Set<string>(), sources: [] }
      n.missing += missing
      n.sources.push({ order_id: o.id, order_number: o.order_number, index, product_id: pid, missing })
      if (o.order_number) n.orders.add(o.order_number)
      need.set(key, n)
    })
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
      sources: n.sources,
    }

    const gid = ps?.suppliers?.id ?? 'none'
    const g = groups.get(gid) ?? {
      supplier_id:   ps?.suppliers?.id ?? null,
      supplier_name: ps?.suppliers?.name ?? 'Ingen leverandør fundet',
      contact_email: ps?.suppliers?.contact_email ?? null,
      lines: [], orders: [], total: 0,
    }
    g.lines.push(line)
    if (line.purchase_price != null) g.total += line.purchase_price * line.order_qty
    groups.set(gid, g)
  }

  // Fordel hver leverandørs varer på ordrerne (antal = det der mangler til ordren; minimumsordre-overskud hører ikke til en ordre)
  for (const g of groups.values()) {
    const byOrder = new Map<string, PurchaseOrder>()
    for (const l of g.lines) for (const src of l.sources) {
      const info = orderInfo.get(src.order_id)
      if (!info) continue
      const po = byOrder.get(src.order_id) ?? { ...info, lines: [] }
      po.lines.push({ name: l.name, sku: l.sku, supplier_sku: l.supplier_sku, qty: src.missing, purchase_price: l.purchase_price })
      byOrder.set(src.order_id, po)
    }
    g.orders = [...byOrder.values()].sort((a, b) => (b.ordered_at ?? '').localeCompare(a.ordered_at ?? ''))
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

// ── Bestilt ──────────────────────────────────────────────────────────────────────

type OrderRow = { line_items: unknown; updated_at: string }

// Opdatér en ordres linjer, kun hvis ordren ikke er ændret siden læsning (fx af lagerreservationen)
async function updateOrderLines(orderId: string, change: (lines: Line[]) => Line[] | null): Promise<boolean> {
  const supabase = createServiceClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: o } = await supabase.from('orders').select('line_items, updated_at').eq('id', orderId).maybeSingle<OrderRow>()
    if (!o) return false
    const lines = (Array.isArray(o.line_items) ? structuredClone(o.line_items) : []) as Line[]
    const next = change(lines)
    if (!next) return true
    const { data } = await supabase.from('orders')
      .update({ line_items: next, updated_at: new Date().toISOString() })
      .eq('id', orderId).eq('updated_at', o.updated_at)
      .select('id')
    if (data?.length) return true
  }
  return false
}

function newRef(supplierName: string): string {
  const d = new Date()
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const slug = supplierName.toUpperCase().replace(/[^A-ZÆØÅ0-9]+/g, '').slice(0, 10) || 'LEV'
  return `IND-${stamp}-${slug}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

// Markér alt, der skal bestilles hos én leverandør, som bestilt. Listen beregnes igen på serveren.
// Med orderId: kun den ene ordres varer (fx bestilt med levering direkte til kunden).
export async function markSupplierOrdered(supplierId: string, by: string, orderId?: string):
  Promise<{ ref: string; lines: number; orders: number; failed: number } | { error: string }> {
  const { groups, error } = await buildPurchaseList()
  if (error) return { error }
  const group = groups.find(g => g.supplier_id === supplierId)
  if (!group) return { error: 'Intet at bestille hos denne leverandør' }

  const ref = newRef(group.supplier_name)
  const at  = new Date().toISOString()
  const byOrder = new Map<string, PurchaseLine['sources']>()
  let lineCount = 0
  for (const l of group.lines) {
    const srcs = orderId ? l.sources.filter(s => s.order_id === orderId) : l.sources
    if (srcs.length) lineCount++
    for (const s of srcs) byOrder.set(s.order_id, [...(byOrder.get(s.order_id) ?? []), s])
  }
  if (byOrder.size === 0) return { error: 'Ordren har intet at bestille hos denne leverandør' }

  let failed = 0
  for (const [orderId, sources] of byOrder) {
    const ok = await updateOrderLines(orderId, lines => {
      let changed = false
      for (const s of sources) {
        const l = lines[s.index]
        if (!l || l.product_id !== s.product_id) continue          // linjen er flyttet — spring over
        const still = Math.max(0, (Number(l.qty) || 0) - (Number(l.reserved_qty) || 0) - orderedQty(l))
        const qty = Math.min(still, s.missing)
        if (qty <= 0) continue
        const entry: OrderedEntry = { ref, qty, supplier_id: supplierId, supplier_name: group.supplier_name, at, by }
        l.ordered = [...(Array.isArray(l.ordered) ? l.ordered : []), entry]
        changed = true
      }
      return changed ? lines : null
    })
    if (!ok) failed++
  }
  return { ref, lines: lineCount, orders: byOrder.size, failed }
}

export type OrderedBatch = {
  ref: string; supplier_name: string; at: string; by: string
  lines: { name: string; sku: string; qty: number; order_number: string | null; order_id: string }[]
}

// Bestillinger på åbne ordrer, nyeste først
export async function buildOrderedList(): Promise<{ batches: OrderedBatch[]; error: string | null }> {
  const { data: orders, error } = await createServiceClient().from('orders')
    .select('id, order_number, line_items')
    .not('status', 'in', '(completed,cancelled)')
    .limit(2000)
  if (error) return { batches: [], error: error.message }

  const batches = new Map<string, OrderedBatch>()
  for (const o of orders ?? []) {
    for (const l of (Array.isArray(o.line_items) ? o.line_items : []) as Line[]) {
      for (const e of Array.isArray(l.ordered) ? l.ordered : []) {
        const b = batches.get(e.ref) ?? { ref: e.ref, supplier_name: e.supplier_name, at: e.at, by: e.by, lines: [] }
        b.lines.push({ name: l.name ?? '', sku: l.sku ?? '', qty: Number(e.qty) || 0, order_number: o.order_number, order_id: o.id })
        batches.set(e.ref, b)
      }
    }
  }
  return { batches: [...batches.values()].sort((a, b) => b.at.localeCompare(a.at)), error: null }
}

// Fortryd en bestilling: fjern dens poster fra alle åbne ordrer
export async function undoOrdered(ref: string): Promise<{ orders: number; failed: number }> {
  const { batches } = await buildOrderedList()
  const batch = batches.find(b => b.ref === ref)
  if (!batch) return { orders: 0, failed: 0 }
  const orderIds = [...new Set(batch.lines.map(l => l.order_id))]
  let failed = 0
  for (const id of orderIds) {
    const ok = await updateOrderLines(id, lines => {
      let changed = false
      for (const l of lines) {
        if (!Array.isArray(l.ordered) || !l.ordered.some(e => e.ref === ref)) continue
        const rest = l.ordered.filter(e => e.ref !== ref)
        if (rest.length) l.ordered = rest
        else delete l.ordered
        changed = true
      }
      return changed ? lines : null
    })
    if (!ok) failed++
  }
  return { orders: orderIds.length, failed }
}
