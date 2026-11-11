import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isShippingMethod, shippingCost } from '@/lib/shop/shipping'
import { startPayment, confirmationPath, isPaymentMethod, onlinePaymentAvailable, type PaymentMethod } from '@/lib/shop/payment'
import { getShopUser } from '@/lib/shop/auth'
import { payAtPickupEligible } from '@/lib/shop/customers'
import { sendOrderConfirmation } from '@/lib/shop/order-email'
import { getCurrentAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

type InItem = { id: string; qty: number; price: number }
type Customer = { name: string; email: string; phone: string; address: string; postcode: string; city: string }

type Line = {
  cart_id: string; product_id: string; variant_id: string | null
  sku: string; name: string; image: string | null
  qty: number; price: number; line_total: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str  = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// POST /api/shop/orders
// Body: { items: [{id, qty, price}], customer: {...}, shipping_method, note?, marketing?, accept_terms }
// 409 hvis priser er ændret eller varer ikke længere kan købes — klienten opdaterer kurven.
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig forespørgsel' }, { status: 400 })
  }

  const c = (body.customer ?? {}) as Record<string, unknown>
  const customer: Customer = {
    name: str(c.name), email: str(c.email).toLowerCase(), phone: str(c.phone, 30),
    address: str(c.address), postcode: str(c.postcode, 10), city: str(c.city, 80),
  }
  const method = body.shipping_method
  const note   = str(body.note, 1000) || null

  if (!isShippingMethod(method))
    return NextResponse.json({ error: 'Vælg en leveringsmetode' }, { status: 400 })
  const payment = body.payment_method
  if (!isPaymentMethod(payment))
    return NextResponse.json({ error: 'Vælg en betalingsmetode' }, { status: 400 })
  if (payment === 'online' && !(await onlinePaymentAvailable(!!(await getCurrentAdmin()))))
    return NextResponse.json({ error: 'Online betaling er ikke åbnet endnu' }, { status: 400 })

  const sessionUser = await getShopUser()
  if (payment === 'pickup') {
    if (!sessionUser)
      return NextResponse.json({ error: 'Log ind for at betale ved afhentning' }, { status: 401 })
    if (method !== 'pickup')
      return NextResponse.json({ error: 'Betal ved afhentning kræver, at du henter varerne i butikken' }, { status: 400 })
    if (!(await payAtPickupEligible(sessionUser.id)))
      return NextResponse.json({ error: 'Betal ved afhentning er for kunder, der har handlet hos os før' }, { status: 403 })
  }
  if (!body.accept_terms)
    return NextResponse.json({ error: 'Du skal acceptere handelsbetingelserne' }, { status: 400 })
  if (!customer.name || !customer.phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
    return NextResponse.json({ error: 'Udfyld navn, gyldig e-mail og telefon' }, { status: 400 })
  if (method === 'delivery' && (!customer.address || !/^\d{4}$/.test(customer.postcode) || !customer.city))
    return NextResponse.json({ error: 'Udfyld leveringsadresse med 4-cifret postnummer' }, { status: 400 })

  const rawItems = Array.isArray(body.items) ? body.items as InItem[] : []
  const items = rawItems
    .map(i => ({ id: str(i?.id, 80), qty: Math.floor(Number(i?.qty)), price: Number(i?.price) }))
    .filter(i => i.id && Number.isFinite(i.qty) && i.qty >= 1 && i.qty <= 99)
  if (items.length === 0 || items.length > 100)
    return NextResponse.json({ error: 'Kurven er tom' }, { status: 400 })

  const parsed = items.map(i => {
    const [productId, variantId = null] = i.id.split('__')
    return { ...i, productId, variantId }
  })
  if (parsed.some(p => !UUID.test(p.productId) || (p.variantId !== null && !UUID.test(p.variantId))))
    return NextResponse.json({ error: 'Ugyldig vare i kurven' }, { status: 400 })

  const supabase   = createServiceClient()
  const productIds = [...new Set(parsed.map(p => p.productId))]
  const variantIds = [...new Set(parsed.map(p => p.variantId).filter((v): v is string => !!v))]

  const [{ data: products, error: pErr }, { data: variants, error: vErr }] = await Promise.all([
    supabase.from('products')
      .select('id, name, internal_sku, sales_price, status, product_images ( url, is_primary, position )')
      .in('id', productIds),
    variantIds.length
      ? supabase.from('product_variants')
          .select('id, product_id, internal_variant_sku, sales_price, status, attributes')
          .in('id', variantIds)
      : Promise.resolve({ data: [] as never[], error: null }),
  ])
  // Ved databasefejl må varer ikke meldes "utilgængelige" — så fjerner klienten dem fra kurven
  if (pErr || vErr || !products) {
    return NextResponse.json({ error: 'Butikken kan ikke tage imod ordrer lige nu. Prøv igen om lidt.' }, { status: 503 })
  }

  type P = { id: string; name: string; internal_sku: string; sales_price: number | null; status: string
             product_images: { url: string; is_primary: boolean; position: number }[] | null }
  type V = { id: string; product_id: string; internal_variant_sku: string; sales_price: number | null
             status: string; attributes: { name: string; value: string }[] | null }
  const pMap = new Map((products as P[] ?? []).map(p => [p.id, p]))
  const vMap = new Map((variants as V[] ?? []).map(v => [v.id, v]))

  const lines: Line[] = []
  const unavailable: string[] = []
  const changed: { id: string; price: number }[] = []

  for (const it of parsed) {
    const p = pMap.get(it.productId)
    const v = it.variantId ? vMap.get(it.variantId) : null
    const sellable = p && !['archived', 'rejected'].includes(p.status)
      && (!it.variantId || (v && v.product_id === p.id && v.status === 'active'))
    const price = it.variantId ? (v?.sales_price ?? p?.sales_price ?? null) : (p?.sales_price ?? null)
    if (!p || !sellable || price == null || price <= 0) { unavailable.push(it.id); continue }

    if (Math.abs(price - it.price) > 0.005) changed.push({ id: it.id, price })

    const imgs  = p.product_images ?? []
    const image = (imgs.find(i => i.is_primary) ?? [...imgs].sort((a, b) => a.position - b.position)[0])?.url ?? null
    const attrs = (v?.attributes ?? []).map(a => a.value).filter(Boolean).join(', ')
    lines.push({
      cart_id: it.id, product_id: p.id, variant_id: v?.id ?? null,
      sku: v?.internal_variant_sku ?? p.internal_sku,
      name: attrs ? `${p.name} — ${attrs}` : p.name,
      image, qty: it.qty, price, line_total: Math.round(price * it.qty * 100) / 100,
    })
  }

  if (unavailable.length || changed.length) {
    return NextResponse.json({
      error: unavailable.length
        ? 'Nogle varer kan ikke længere købes og er fjernet fra kurven.'
        : 'Nogle priser er ændret siden du lagde varerne i kurven. Tjek beløbet og prøv igen.',
      unavailable, changed,
    }, { status: 409 })
  }

  const subtotal = Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100
  const shipping = shippingCost(subtotal, method)
  const total    = Math.round((subtotal + shipping) * 100) / 100

  // Indlogget kunde ejer ordren; ellers opret/find kunden på e-mail.
  // Marketing-samtykke kan kun gives her, aldrig trækkes tilbage.
  const user = sessionUser
    ? { id: sessionUser.id }
    : (await supabase
        .from('shop_users')
        .upsert({ email: customer.email, updated_at: new Date().toISOString() }, { onConflict: 'email' })
        .select('id')
        .single()).data
  if (user && body.marketing) {
    await supabase.from('shop_users')
      .update({ marketing_opt_in: true, marketing_opt_in_at: new Date().toISOString() })
      .eq('id', user.id).eq('marketing_opt_in', false)
  }

  const accessToken = randomBytes(24).toString('hex')
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      source:          'webshop',
      status:          'pending',
      payment_status:  'unpaid',
      payment_method:  payment,
      payment_provider: payment === 'pickup' ? 'pay_at_pickup' : null,
      shop_user_id:    user?.id ?? null,
      email:           customer.email,
      customer_info:   customer,
      line_items:      lines,
      shipping_method: method,
      shipping_total:  shipping,
      subtotal,
      order_total:     total,
      customer_note:   note,
      access_token:    accessToken,
    })
    .select('id, order_number, access_token')
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Ordren kunne ikke oprettes. Prøv igen.' }, { status: 500 })
  }

  // Reservér fra eget lager. Fejler det, er ordren stadig gyldig — admin kan reservere via status.
  const { error: stockErr } = await supabase.rpc('order_stock_apply', { p_order: order.id, p_action: 'reserve', p_actor: 'webshop' })
  if (stockErr) console.error(`[ordre ${order.order_number}] lagerreservation fejlede: ${stockErr.message}`)

  // Betal ved afhentning: bekræftelse nu. Online: først når betalingen er reserveret (syncPayment)
  if (payment === 'pickup') {
    await sendOrderConfirmation(order.id)
    return NextResponse.json({ ok: true, order_number: order.order_number, redirect: confirmationPath(order) })
  }
  try {
    const { redirectUrl } = await startPayment(
      { ...order, order_total: total, email: customer.email },
      { userAgent: request.headers.get('user-agent') ?? '' },
    )
    return NextResponse.json({ ok: true, order_number: order.order_number, redirect: redirectUrl })
  } catch (e) {
    console.error(`[ordre ${order.order_number}] betaling kunne ikke startes:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Betalingen kunne ikke startes. Prøv igen om lidt — din ordre er gemt.', order_number: order.order_number }, { status: 502 })
  }
}
