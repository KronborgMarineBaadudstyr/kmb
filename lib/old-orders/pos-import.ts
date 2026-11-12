import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import type { PosReceipt } from './pos-parser'

// Import af kassesalg (pos-parser.ts) som ordrer med source 'pos' — til salgsanalyse og AI-assistent
// (købes sammen, sæson, prisfølsomhed). Ingen lagerpåvirkning (stock_state 'none'), ingen mails.
// order_number = "POS-<bonnr>" (kassens FAK-numre er en anden serie end PDF-fakturaernes), så samme bon
// ikke kan importeres to gange. Kundenummer, der ligner et telefonnummer, gemmes som customer_info.phone,
// så bonnen knyttes til kunden, når de logger ind med SMS.

export type PosMatch = { product_id: string; variant_id: string | null; name: string; via: string }

const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Kassens varenumre i de former, leverandørerne bruger: "0091000209" → "91000209", "PM-1630967" → "1630967", "HF81102" → "81102"
export function skuCandidates(itemNo: string): string[] {
  const raw = itemNo.trim()
  const c = new Set<string>([raw])
  const noZeros = raw.replace(/^0+(?=\d)/, '')
  c.add(noZeros)
  const noPrefix = raw.replace(/^[A-Za-z]{1,3}-/, '')
  c.add(noPrefix)
  c.add(noPrefix.replace(/^0+(?=\d)/, ''))
  const letters = raw.match(/^([A-Za-z]{1,3})(\d.*)$/)
  if (letters) c.add(letters[2])
  // Afledte numre skal være lange nok til ikke at ramme tilfældigt (fx gavekort "0000000800" → "800")
  return [...c].filter(s => s === raw || s.length >= 5)
}

// Kassens varegruppe ("PALBY", "HF MARINE") passer til leverandøren?
const groupFits = (group: string | null, supplier: string | null) => {
  if (!group || !supplier) return false
  const g = norm(group.split(/\s+/)[0]), s = norm(supplier)
  return g.length >= 2 && (s.startsWith(g) || s.includes(g))
}

// Kassens varenumre → vores produkter. Foretrækker uændret varenr. og leverandøren, der passer til varegruppen.
export async function matchPosItems(items: { item_no: string; group: string | null }[]): Promise<Record<string, PosMatch>> {
  const supabase = createServiceClient()
  const out: Record<string, PosMatch & { score: number }> = {}
  const candOf = new Map<string, string[]>()
  for (const it of items) if (!candOf.has(it.item_no)) candOf.set(it.item_no, skuCandidates(it.item_no))
  const groupOf = new Map(items.map(i => [i.item_no, i.group]))
  const byCand = new Map<string, string[]>()           // kandidat → kassens varenumre
  for (const [item, cands] of candOf) for (const c of cands) byCand.set(c, [...(byCand.get(c) ?? []), item])
  const all = [...byCand.keys()]

  const offer = (cand: string, m: PosMatch, supplier: string | null) => {
    for (const item of byCand.get(cand) ?? []) {
      const exact = cand === item.trim()
      const score = (exact ? 2 : 0) + (groupFits(groupOf.get(item) ?? null, supplier) ? 1 : 0)
      const cur = out[item]
      if (!cur || score > cur.score) out[item] = { ...m, score }
    }
  }

  for (const part of chunk(all)) {
    const [{ data: ps }, { data: ean }, { data: vEan }, { data: own }, { data: mfr }] = await Promise.all([
      supabase.from('product_suppliers').select('supplier_sku, product_id, variant_id, products ( name ), suppliers ( name )')
        .in('supplier_sku', part).not('product_id', 'is', null),
      supabase.from('products').select('id, name, ean, variant_of_product_id').in('ean', part),
      supabase.from('product_variants').select('id, product_id, ean, products ( name )').in('ean', part),
      supabase.from('products').select('id, name, internal_sku').in('internal_sku', part),
      supabase.from('products').select('id, name, manufacturer_sku').in('manufacturer_sku', part),
    ])
    for (const r of (ps ?? []) as unknown as { supplier_sku: string; product_id: string; variant_id: string | null; products: { name: string } | null; suppliers: { name: string } | null }[]) {
      offer(r.supplier_sku, { product_id: r.product_id, variant_id: r.variant_id, name: r.products?.name ?? '', via: `${r.suppliers?.name ?? 'leverandør'} varenr.` }, r.suppliers?.name ?? null)
    }
    for (const p of ean ?? []) offer(p.ean as string, { product_id: (p.variant_of_product_id as string | null) ?? p.id, variant_id: null, name: p.name, via: 'EAN' }, null)
    for (const v of (vEan ?? []) as unknown as { id: string; product_id: string; ean: string; products: { name: string } | null }[]) {
      offer(v.ean, { product_id: v.product_id, variant_id: v.id, name: v.products?.name ?? '', via: 'EAN (variant)' }, null)
    }
    for (const p of own ?? []) offer(p.internal_sku as string, { product_id: p.id, variant_id: null, name: p.name, via: 'vores varenr.' }, null)
    for (const p of mfr ?? []) offer(p.manufacturer_sku as string, { product_id: p.id, variant_id: null, name: p.name, via: 'producentens varenr.' }, null)
  }
  return Object.fromEntries(Object.entries(out).map(([k, { score: _s, ...m }]) => [k, m]))
}

// "2024-03-27T09:45" (dansk tid) → ISO i UTC (sommer-/vintertid håndteres)
export function copenhagenToIso(local: string): string {
  const guess = new Date(`${local}:00Z`)
  const offsetAt = (d: Date) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Copenhagen', timeZoneName: 'shortOffset' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1'
    const m = name.match(/GMT([+-]\d+)/)
    return (m ? Number(m[1]) : 1) * 60
  }
  const off = offsetAt(new Date(guess.getTime() - 60 * 60_000))
  return new Date(guess.getTime() - off * 60_000).toISOString()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PosLineMatch = { product_id: string; variant_id: string | null }

// Importér bonner. matches: kassens varenr. → produkt (fra forhåndsvisningen). Allerede importerede springes over.
export async function importPosReceipts(receipts: PosReceipt[], matches: Record<string, PosLineMatch>): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const supabase = createServiceClient()
  const rows = receipts.map(r => {
    const at = copenhagenToIso(r.local_time)
    return {
      source:             'pos',
      order_number:       `POS-${r.doc_no}`,
      status:             'completed',
      fulfillment_status: 'delivered',
      payment_status:     'paid',
      payment_method:     'pos',
      payment_provider:   r.payments.join(', ').slice(0, 80) || null,
      paid_at:            at,
      ordered_at:         at,
      email:              null,
      customer_info: {
        kind: r.doc_type,
        ...(r.customer_no ? { customer_number: r.customer_no } : {}),
        ...(r.phone ? { phone: r.phone } : {}),
      },
      line_items: r.lines.map((l, i) => {
        const m = matches[l.item_no]
        const ok = m && UUID.test(m.product_id) && (!m.variant_id || UUID.test(m.variant_id))
        return {
          cart_id:    `${r.doc_no}-${i + 1}`,
          product_id: ok ? m.product_id : null,
          variant_id: ok ? m.variant_id : null,
          sku:        l.item_no,
          name:       l.name,
          qty:        l.qty,
          price:      l.price,
          ...(l.discount ? { discount: l.discount } : {}),
          line_total: l.amount,
          ...(l.group ? { group: l.group } : {}),
        }
      }),
      shipping_method: 'pickup',
      shipping_total:  0,
      subtotal:        r.total,
      order_total:     r.total,
      access_token:    randomBytes(16).toString('hex'),
    }
  })

  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const part of chunk(rows, 250)) {
    const { data, error } = await supabase.from('orders')
      .upsert(part, { onConflict: 'order_number', ignoreDuplicates: true })
      .select('order_number')
    if (error) { errors.push(error.message); continue }
    imported += data?.length ?? 0
    skipped  += part.length - (data?.length ?? 0)
  }
  return { imported, skipped, errors }
}
