import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWooWebhookSignature } from '@/lib/woocommerce/webhooks'

export const dynamic = 'force-dynamic'

// ── WooCommerce ordre-payload (relevant delmængde) ──
type WooLineItem = {
  id:           number
  product_id:   number
  variation_id: number   // 0 = simpelt produkt
  quantity:     number
  name:         string
  sku:          string
  total:        string
}

type WooOrderPayload = {
  id:          number
  status:      string
  currency:    string
  total:        string
  date_created: string
  billing: {
    first_name: string
    last_name:  string
    email:      string
    phone:      string
    address_1:  string
    city:       string
    postcode:   string
    country:    string
  }
  shipping: {
    first_name: string
    last_name:  string
    address_1:  string
    city:       string
    postcode:   string
    country:    string
  }
  shipping_total: string
  shipping_lines: { method_title: string }[]
  line_items: WooLineItem[]
  meta_data: { key: string; value: unknown }[]
}

// Statusser der indikerer at varer reelt er solgt / reserveret
const STOCK_DEDUCTION_STATUSES = new Set([
  'processing',
  'on-hold',
  'completed',
])

// Statusser der frigiver reserveret lager
const STOCK_RELEASE_STATUSES = new Set([
  'cancelled',
  'refunded',
  'failed',
])

export async function POST(request: Request) {
  // ── 1. Verificér signatur ──
  const rawBody  = await request.text()
  const sig      = request.headers.get('x-wc-webhook-signature') ?? ''
  const topic    = request.headers.get('x-wc-webhook-topic')     ?? ''
  const wooId    = request.headers.get('x-wc-webhook-id')        ?? ''
  const secret   = process.env.WOO_WEBHOOK_SECRET ?? ''

  if (secret && !verifyWooWebhookSignature(rawBody, sig, secret)) {
    console.error(`[Webhook] Ugyldig signatur — topic: ${topic}`)
    return NextResponse.json({ error: 'Ugyldig signatur' }, { status: 401 })
  }

  // ── 2. Parse payload ──
  let order: WooOrderPayload
  try {
    order = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  console.log(`[Webhook] ${topic} — Ordre #${order.id} (${order.status})`)

  // ── 3. Kun ordre-topics ──
  if (!topic.startsWith('order.')) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const supabase = createServiceClient()

  // ── 4. Hent eksisterende ordre (idempotens) ──
  const { data: existing } = await supabase
    .from('orders')
    .select('id, status, fulfillment_status')
    .eq('woo_order_id', order.id)
    .single()

  const wasProcessed = existing
    ? STOCK_DEDUCTION_STATUSES.has(existing.status)
    : false

  const isNowProcessed  = STOCK_DEDUCTION_STATUSES.has(order.status)
  const isNowCancelled  = STOCK_RELEASE_STATUSES.has(order.status)

  // ── 5. Upsert ordre i vores tabel ──
  const orderRow = {
    woo_order_id:       order.id,
    status:             order.status,
    fulfillment_status: existing?.fulfillment_status ?? 'unrouted',
    customer_info: {
      first_name: order.billing.first_name,
      last_name:  order.billing.last_name,
      email:      order.billing.email,
      phone:      order.billing.phone,
      address:    `${order.billing.address_1}, ${order.billing.postcode} ${order.billing.city}`,
      country:    order.billing.country,
    },
    line_items: order.line_items.map(li => ({
      woo_line_item_id: li.id,
      woo_product_id:   li.product_id,
      woo_variation_id: li.variation_id || null,
      sku:              li.sku,
      name:             li.name,
      quantity:         li.quantity,
      total:            parseFloat(li.total),
    })),
    shipping_method: order.shipping_lines[0]?.method_title ?? null,
    shipping_total:  parseFloat(order.shipping_total),
    order_total:     parseFloat(order.total),
    currency:        order.currency,
    woo_created_at:  order.date_created,
  }

  const { data: upsertedOrder, error: orderErr } = await supabase
    .from('orders')
    .upsert(orderRow, { onConflict: 'woo_order_id' })
    .select('id')
    .single()

  if (orderErr) {
    console.error('[Webhook] Fejl ved ordre upsert:', orderErr)
    return NextResponse.json({ error: 'DB fejl' }, { status: 500 })
  }

  // ── 6. Lagerhåndtering ──
  // Hent Supabase produkt-IDs for linje-varerne via woo_product_id / woo_variation_id
  const wooProductIds   = [...new Set(order.line_items.map(li => li.product_id))]
  const wooVariationIds = [...new Set(order.line_items.map(li => li.variation_id).filter(Boolean))]

  const [{ data: dbProducts }, { data: dbVariants }] = await Promise.all([
    supabase
      .from('products')
      .select('id, woo_product_id, own_stock_quantity, own_stock_reserved, name')
      .in('woo_product_id', wooProductIds),
    wooVariationIds.length > 0
      ? supabase
          .from('product_variants')
          .select('id, woo_variation_id, own_stock_quantity, own_stock_reserved')
          .in('woo_variation_id', wooVariationIds)
      : Promise.resolve({ data: [] }),
  ])

  const productByWooId  = Object.fromEntries((dbProducts  ?? []).map(p => [p.woo_product_id,  p]))
  const variantByWooId  = Object.fromEntries((dbVariants  ?? []).map(v => [v.woo_variation_id, v]))

  // ── 6a. Ny ordre → nedskriv lager ──
  if (isNowProcessed && !wasProcessed) {
    for (const li of order.line_items) {
      const qty = li.quantity

      if (li.variation_id && variantByWooId[li.variation_id]) {
        // Variable produkt — nedskriv variant-lager
        const variant = variantByWooId[li.variation_id]
        const newQty  = Math.max(0, variant.own_stock_quantity - qty)

        await supabase
          .from('product_variants')
          .update({ own_stock_quantity: newQty, own_stock_reserved: variant.own_stock_reserved + qty })
          .eq('id', variant.id)

        await logInventoryEvent(supabase, {
          product_id:  productByWooId[li.product_id]?.id ?? null,
          variant_id:  variant.id,
          source:      'woo_order',
          event_type:  'sale',
          delta:       -qty,
          new_qty:     newQty,
          order_ref:   String(order.id),
          note:        `Woo ordre #${order.id} — ${li.name}`,
        })

      } else if (productByWooId[li.product_id]) {
        // Simpelt produkt — nedskriv produkt-lager
        const product = productByWooId[li.product_id]
        const newQty  = Math.max(0, product.own_stock_quantity - qty)

        await supabase
          .from('products')
          .update({ own_stock_quantity: newQty, own_stock_reserved: product.own_stock_reserved + qty })
          .eq('id', product.id)

        await logInventoryEvent(supabase, {
          product_id:  product.id,
          variant_id:  null,
          source:      'woo_order',
          event_type:  'sale',
          delta:       -qty,
          new_qty:     newQty,
          order_ref:   String(order.id),
          note:        `Woo ordre #${order.id} — ${li.name}`,
        })
      }
    }

    console.log(`[Webhook] Lager nedskrevet for ordre #${order.id}`)
  }

  // ── 6b. Annulleret/refunderet ordre → frigiv reserveret lager ──
  if (isNowCancelled && wasProcessed) {
    for (const li of order.line_items) {
      const qty = li.quantity

      if (li.variation_id && variantByWooId[li.variation_id]) {
        const variant = variantByWooId[li.variation_id]
        const newQty  = variant.own_stock_quantity + qty

        await supabase
          .from('product_variants')
          .update({
            own_stock_quantity: newQty,
            own_stock_reserved: Math.max(0, variant.own_stock_reserved - qty),
          })
          .eq('id', variant.id)

        await logInventoryEvent(supabase, {
          product_id:  productByWooId[li.product_id]?.id ?? null,
          variant_id:  variant.id,
          source:      'woo_order',
          event_type:  'reservation_cancel',
          delta:       qty,
          new_qty:     newQty,
          order_ref:   String(order.id),
          note:        `Woo ordre #${order.id} annulleret — ${li.name}`,
        })

      } else if (productByWooId[li.product_id]) {
        const product = productByWooId[li.product_id]
        const newQty  = product.own_stock_quantity + qty

        await supabase
          .from('products')
          .update({
            own_stock_quantity: newQty,
            own_stock_reserved: Math.max(0, product.own_stock_reserved - qty),
          })
          .eq('id', product.id)

        await logInventoryEvent(supabase, {
          product_id:  product.id,
          variant_id:  null,
          source:      'woo_order',
          event_type:  'reservation_cancel',
          delta:       qty,
          new_qty:     newQty,
          order_ref:   String(order.id),
          note:        `Woo ordre #${order.id} annulleret — ${li.name}`,
        })
      }
    }

    console.log(`[Webhook] Lager frigivet for annulleret ordre #${order.id}`)
  }

  return NextResponse.json({ ok: true, order_id: upsertedOrder?.id })
}

// ── Hjælper: skriv til inventory_events audit-log ──
async function logInventoryEvent(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    product_id:  string | null
    variant_id:  string | null
    source:      string
    event_type:  string
    delta:       number
    new_qty:     number
    order_ref:   string
    note:        string
  }
) {
  await supabase.from('inventory_events').insert({
    product_id:       opts.product_id,
    variant_id:       opts.variant_id,
    source:           opts.source,
    event_type:       opts.event_type,
    quantity_delta:   opts.delta,
    new_quantity:     opts.new_qty,
    order_reference:  opts.order_ref,
    notes:            opts.note,
  })
}
