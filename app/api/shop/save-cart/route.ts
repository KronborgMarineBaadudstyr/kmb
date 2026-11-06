import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendEmail, siteUrl } from '@/lib/shop/email'

export const dynamic = 'force-dynamic'

// POST /api/shop/save-cart
// Body: { email: string, marketing: boolean, cart: CartItem[] }
// Opretter/finder shop_user, gemmer kurv, sender e-mail med link.
export async function POST(request: Request) {
  let body: { email?: string; marketing?: boolean; cart?: unknown[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const email     = (body.email ?? '').trim().toLowerCase()
  const marketing = !!body.marketing
  const cart      = body.cart ?? []

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ugyldig e-mail' }, { status: 400 })
  }
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 100) {
    return NextResponse.json({ error: 'Kurven er tom' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: user, error: userErr } = await supabase
    .from('shop_users')
    .upsert({ email, updated_at: new Date().toISOString() }, { onConflict: 'email' })
    .select('id')
    .single()

  if (userErr || !user) {
    return NextResponse.json({ error: 'Kunne ikke oprette bruger' }, { status: 500 })
  }

  // Samtykke kan kun gives her — et tidligere ja nulstilles ikke af en tom checkbox
  if (marketing) {
    await supabase.from('shop_users')
      .update({ marketing_opt_in: true, marketing_opt_in_at: new Date().toISOString() })
      .eq('id', user.id).eq('marketing_opt_in', false)
  }

  const { data: saved, error: cartErr } = await supabase
    .from('saved_carts')
    .insert({ user_id: user.id, cart_data: cart, token: randomBytes(24).toString('hex') })
    .select('token')
    .single()

  if (cartErr || !saved) {
    return NextResponse.json({ error: 'Kunne ikke gemme kurv' }, { status: 500 })
  }

  const cartLink = `${siteUrl()}/kurv?gem=${saved.token}`

  await sendEmail(email, 'Din gemte kurv hos LoveSailing', `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1a2543">Din kurv er gemt</h2>
      <p>Klik på knappen herunder for at hente din kurv igen — linket er gyldigt i 30 dage.</p>
      <a href="${cartLink}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#FF8500;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:600">
        Hent min kurv →
      </a>
      <p style="font-size:12px;color:#888">Eller kopier dette link:<br>
        <a href="${cartLink}" style="color:#1a2543">${cartLink}</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:11px;color:#aaa">LoveSailing.dk</p>
    </div>
  `).catch(() => false)

  return NextResponse.json({ ok: true, link: cartLink })
}
