import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseIdentifier, newToken, hashToken, safeNext, LOGIN_TOKEN_MINUTES } from '@/lib/shop/auth'
import { sendEmail, emailConfigured, siteUrl } from '@/lib/shop/email'
import { sendSms } from '@/lib/shop/sms'

export const dynamic = 'force-dynamic'

const MAX_PER_HOUR = 5
const unavailable = () =>
  NextResponse.json({ error: 'Login er ikke tilgængeligt lige nu. Prøv igen om lidt.' }, { status: 503 })
const PHONE_MSG = 'Hvis nummeret er registreret hos os, har vi sendt et login-link — via SMS eller til den e-mail der hører til nummeret.'

// POST /api/shop/auth/request  { identifier: "mail@eksempel.dk" | "12345678" }
export async function POST(request: Request) {
  let body: { identifier?: unknown; next?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ugyldig forespørgsel' }, { status: 400 }) }

  const id = parseIdentifier(typeof body.identifier === 'string' ? body.identifier : '')
  if (!id) return NextResponse.json({ error: 'Skriv en gyldig e-mail eller et telefonnummer' }, { status: 400 })

  const supabase = createServiceClient()
  const col      = id.kind === 'email' ? 'email' : 'phone'
  const found = await supabase.from('shop_users').select('id, email, phone').eq(col, id.value).maybeSingle()
  if (found.error) return unavailable()
  let user = found.data

  // Ny kunde med e-mail oprettes ved første login. Telefon-kunder findes kun via importerede ordrer.
  if (!user && id.kind === 'email') {
    const { data } = await supabase.from('shop_users')
      .upsert({ email: id.value, updated_at: new Date().toISOString() }, { onConflict: 'email' })
      .select('id, email, phone').single()
    if (!data) return unavailable()
    user = data
  }
  if (!user) return NextResponse.json({ ok: true, message: PHONE_MSG })

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase.from('shop_login_tokens')
    .select('id', { count: 'exact', head: true }).eq('shop_user_id', user.id).gte('created_at', since)
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: 'For mange forsøg. Prøv igen om en time.' }, { status: 429 })
  }

  const token = newToken()
  const next  = safeNext(body.next)
  const link  = `${siteUrl()}/konto/login?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`
  const sms   = id.kind === 'phone' && await sendSms(id.value, `Log ind på LoveSailing: ${link}`)
  const channel: 'email' | 'sms' = sms ? 'sms' : 'email'
  if (!sms && !user.email) return NextResponse.json({ ok: true, message: PHONE_MSG })

  const ins = await supabase.from('shop_login_tokens').insert({
    shop_user_id: user.id, channel, token_hash: hashToken(token),
    expires_at: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000).toISOString(),
  })
  if (ins.error) return unavailable()

  if (!sms) {
    await sendEmail(user.email!, 'Dit login-link til LoveSailing', `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;color:#1a2543">
        <h2>Log ind på LoveSailing</h2>
        <p>Klik på knappen for at logge ind. Linket virker i ${LOGIN_TOKEN_MINUTES} minutter og kan kun bruges én gang.</p>
        <a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#FF8500;color:#fff;
           border-radius:6px;text-decoration:none;font-weight:600">Log ind →</a>
        <p style="font-size:12px;color:#888">Har du ikke bedt om at logge ind, kan du se bort fra denne mail.</p>
      </div>`).catch(() => false)
  }

  return NextResponse.json({
    ok: true,
    message: id.kind === 'phone'
      ? PHONE_MSG
      : `Vi har sendt et login-link til ${id.value}. Linket virker i ${LOGIN_TOKEN_MINUTES} minutter.`,
    // Lokalt uden Resend: vis linket, så login kan testes. Aldrig i produktion.
    ...(process.env.NODE_ENV !== 'production' && !emailConfigured() ? { dev_link: link } : {}),
  })
}
