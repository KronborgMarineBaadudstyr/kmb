import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import type { ParsedInvoice } from './invoice-parser'

// Import af gamle salgsbilag (se invoice-parser.ts). PDF'en læses i browseren — her kommer kun de læste fakturaer.
//
// Hver faktura bliver én ordre: order_number = fakturanummer (FAK00001 → kan ikke importeres to gange),
// source 'import', status completed + betalt, ordered_at = bilagsdato, kunde i customer_info (phone fra Kundenr.).
// Varelinjer kobles til vores produkter via varenummer (EAN/varenr./leverandørens varenr.), så salgsanalyse og
// levetids-påmindelser virker. Kunden knyttes til en konto, når de logger ind med samme telefonnummer
// (link_orders_to_shop_user, kun via bekræftet kanal).

export type ProductMatch = { product_id: string; variant_id: string | null; name: string; via: string }

export type InvoiceCheck = {
  invoice:        string
  exists:         boolean                         // allerede importeret (samme fakturanummer)
  possibleDuplicate: { order_number: string | null; source: string; email: string | null; ordered_at: string } | null
  matches:        Record<string, ProductMatch>     // varenr. → produkt
}

const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// Varenumre → produkter. EAN (8–14 cifre) matcher EAN på produkt eller variant; ellers vores varenr.,
// producentens varenr. eller leverandørens varenr.
export async function matchSkus(skus: string[]): Promise<Record<string, ProductMatch>> {
  const supabase = createServiceClient()
  const out: Record<string, ProductMatch> = {}
  const uniq = [...new Set(skus.map(s => s.trim()).filter(Boolean))]
  const set = (sku: string, m: ProductMatch) => { if (!out[sku]) out[sku] = m }

  for (const part of chunk(uniq)) {
    const [{ data: byEan }, { data: varEan }, { data: bySku }, { data: byMfr }] = await Promise.all([
      supabase.from('products').select('id, name, ean, variant_of_product_id').in('ean', part),
      supabase.from('product_variants').select('id, product_id, ean, products ( name )').in('ean', part),
      supabase.from('products').select('id, name, internal_sku').in('internal_sku', part),
      supabase.from('products').select('id, name, manufacturer_sku').in('manufacturer_sku', part),
    ])
    for (const v of (varEan ?? []) as unknown as { id: string; product_id: string; ean: string; products: { name: string } | null }[]) {
      set(v.ean, { product_id: v.product_id, variant_id: v.id, name: v.products?.name ?? '', via: 'EAN (variant)' })
    }
    for (const p of byEan ?? []) {
      // Et produkt, der er lagt ind som variant under et andet, tælles som overproduktet
      set(p.ean as string, { product_id: (p.variant_of_product_id as string | null) ?? p.id, variant_id: null, name: p.name, via: 'EAN' })
    }
    for (const p of bySku ?? []) set(p.internal_sku as string, { product_id: p.id, variant_id: null, name: p.name, via: 'vores varenr.' })
    for (const p of byMfr ?? []) set(p.manufacturer_sku as string, { product_id: p.id, variant_id: null, name: p.name, via: 'producentens varenr.' })
  }

  const missing = uniq.filter(s => !out[s])
  for (const part of chunk(missing)) {
    const { data } = await supabase.from('product_suppliers')
      .select('supplier_sku, product_id, variant_id, products ( name )').in('supplier_sku', part).not('product_id', 'is', null)
    for (const r of (data ?? []) as unknown as { supplier_sku: string; product_id: string; variant_id: string | null; products: { name: string } | null }[]) {
      set(r.supplier_sku, { product_id: r.product_id, variant_id: r.variant_id, name: r.products?.name ?? '', via: 'leverandørens varenr.' })
    }
  }
  return out
}

// Forhåndsvisning: findes fakturaen allerede, ligner den en ordre der allerede ligger i systemet (fx fra den
// gamle webshop — samme beløb ± 1 dag), og hvilke varer kan kobles
export async function checkInvoices(invoices: ParsedInvoice[]): Promise<InvoiceCheck[]> {
  const supabase = createServiceClient()
  const numbers = invoices.map(i => i.invoice)
  const existing = new Set<string>()
  for (const part of chunk(numbers)) {
    const { data } = await supabase.from('orders').select('order_number').in('order_number', part)
    for (const r of data ?? []) existing.add(r.order_number as string)
  }

  // Mulige dubletter: ordrer (ikke fra denne import) med samme total inden for ±1 dag
  const dated = invoices.filter(i => i.date && i.total != null)
  const minDate = dated.map(i => i.date!).sort()[0]
  const maxDate = dated.map(i => i.date!).sort().at(-1)
  type Other = { order_number: string | null; source: string; email: string | null; ordered_at: string; order_total: number; customer_info: { email?: string } | null }
  const others: Other[] = []
  if (minDate && maxDate) {
    const from = new Date(new Date(minDate).getTime() - 2 * 86400_000).toISOString()
    const to   = new Date(new Date(maxDate).getTime() + 2 * 86400_000).toISOString()
    for (let p = 0; p < 50; p++) {
      const { data } = await supabase.from('orders')
        .select('order_number, source, email, ordered_at, order_total, customer_info')
        .not('source', 'in', '(import,pos)').gte('ordered_at', from).lte('ordered_at', to)
        .order('ordered_at').range(p * 1000, p * 1000 + 999)
      others.push(...((data ?? []) as Other[]))
      if (!data || data.length < 1000) break
    }
  }

  const matches = await matchSkus(invoices.flatMap(i => i.lines.map(l => l.sku ?? '')))
  return invoices.map(inv => {
    const dup = inv.date && inv.total != null
      ? others.find(o => Math.abs(Number(o.order_total) - inv.total!) < 0.01
          && Math.abs(new Date(o.ordered_at).getTime() - new Date(`${inv.date}T12:00:00Z`).getTime()) <= 36 * 3600_000)
      : undefined
    const own: Record<string, ProductMatch> = {}
    for (const l of inv.lines) if (l.sku && matches[l.sku]) own[l.sku] = matches[l.sku]
    return {
      invoice: inv.invoice,
      exists: existing.has(inv.invoice),
      possibleDuplicate: dup ? { order_number: dup.order_number, source: dup.source, email: dup.email ?? dup.customer_info?.email ?? null, ordered_at: dup.ordered_at } : null,
      matches: own,
    }
  })
}

// Importér fakturaer. Springer over dem, der allerede er importeret (samme fakturanummer).
export async function importInvoices(invoices: ParsedInvoice[], by: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const supabase = createServiceClient()
  const matches = await matchSkus(invoices.flatMap(i => i.lines.map(l => l.sku ?? '')))
  const errors: string[] = []
  let imported = 0, skipped = 0

  const rows = invoices.map(inv => {
    const lines = inv.lines.map((l, idx) => {
      const m = l.sku ? matches[l.sku] : undefined
      return {
        cart_id:    `${inv.invoice}-${idx + 1}`,
        product_id: m?.product_id ?? null,
        variant_id: m?.variant_id ?? null,
        sku:        l.sku,
        name:       l.name,
        qty:        l.qty,
        price:      l.price,
        ...(l.discount ? { discount: l.discount } : {}),
        line_total: l.amount,
      }
    })
    const shipping = inv.shipping?.amount ?? 0
    const total = inv.total ?? lines.reduce((s, l) => s + l.line_total, 0) + shipping
    const at = inv.date ? `${inv.date}T12:00:00+01:00` : new Date().toISOString()
    return {
      source:          'import',
      order_number:    inv.invoice,
      status:          'completed',
      fulfillment_status: 'delivered',
      payment_status:  'paid',
      paid_at:         at,
      ordered_at:      at,
      email:           null,
      customer_info: {
        name: inv.customer.name, company: inv.customer.company, address: inv.customer.address,
        postcode: inv.customer.postcode, city: inv.customer.city, phone: inv.customer.phone,
        customer_number: inv.customer_number,
        ...(inv.delivery ? { delivery: inv.delivery } : {}),
      },
      line_items:      lines,
      shipping_method: inv.shipping_method,
      shipping_total:  shipping,
      subtotal:        Math.round((total - shipping) * 100) / 100,
      order_total:     total,
      customer_note:   `Importeret fra gamle salgsbilag${inv.order_ref ? ` (${inv.order_ref})` : ''}${inv.shipping ? ` · ${inv.shipping.name}` : ''} · ${by}`,
      access_token:    randomBytes(24).toString('hex'),
    }
  })

  for (const part of chunk(rows, 50)) {
    const { data, error } = await supabase.from('orders')
      .upsert(part, { onConflict: 'order_number', ignoreDuplicates: true })
      .select('order_number')
    if (error) { errors.push(error.message); continue }
    imported += data?.length ?? 0
    skipped += part.length - (data?.length ?? 0)
  }
  return { imported, skipped, errors }
}
