import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/shop/save-cart
// Body: { email: string, marketing: boolean, cart: CartItem[] }
// Opretter/finder shop_user, gemmer kurv, sender e-mail med link.
export async function POST(request: Request) {
  let body: { email?: string; marketing?: boolean; cart?: unknown[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const email    = (body.email ?? '').trim().toLowerCase()
  const marketing = !!body.marketing
  const cart     = body.cart ?? []

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ugyldig e-mail' }, { status: 400 })
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    return NextResponse.json({ error: 'Kurven er tom' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Upsert shop_user
  const { data: user, error: userErr } = await supabase
    .from('shop_users')
    .upsert(
      {
        email,
        marketing_opt_in: marketing,
        marketing_opt_in_at: marketing ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (userErr || !user) {
    return NextResponse.json({ error: 'Kunne ikke oprette bruger' }, { status: 500 })
  }

  // Gem kurv
  const { data: saved, error: cartErr } = await supabase
    .from('saved_carts')
    .insert({ user_id: user.id, cart_data: cart })
    .select('token')
    .single()

  if (cartErr || !saved) {
    return NextResponse.json({ error: 'Kunne ikke gemme kurv' }, { status: 500 })
  }

  // Byg link
  const proto = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://lovesailing.dk'
  const cartLink = `${proto}/kurv?gem=${saved.token}`

  // Send e-mail via Resend (valgfrit — vises altid i response så UI kan vise det)
  await sendCartEmail(email, cartLink).catch(() => { /* log men bryd ikke flow */ })

  return NextResponse.json({ ok: true, link: cartLink })
}

async function sendCartEmail(to: string, link: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return // ingen mail hvis nøgle mangler

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'LoveSailing <no-reply@lovesailing.dk>',
      to: [to],
      subject: 'Din gemte kurv hos LoveSailing',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1a2543">Din kurv er gemt 🛒</h2>
          <p>Klik på knappen herunder for at hente din kurv igen — linket er gyldigt i 30 dage.</p>
          <a href="${link}"
             style="display:inline-block;margin:16px 0;padding:12px 24px;
                    background:#FF8500;color:#fff;border-radius:6px;
                    text-decoration:none;font-weight:600">
            Hent min kurv →
          </a>
          <p style="font-size:12px;color:#888">
            Eller kopier dette link:<br>
            <a href="${link}" style="color:#1a2543">${link}</a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:11px;color:#aaa">LoveSailing.dk — Sejlsport og fritidsbåde</p>
        </div>
      `,
    }),
  })
}
