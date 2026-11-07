import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { endAdminSession } from '@/lib/admin-auth'
import { ADMIN_TOKEN_MINUTES } from '@/lib/admin-session'
import { newToken, hashToken, safeNext } from '@/lib/tokens'
import { sendEmail, emailConfigured, siteUrl } from '@/lib/shop/email'

export const dynamic = 'force-dynamic'

const MAX_PER_HOUR = 5
const SENT_MSG = 'Hvis e-mailen tilhører en administrator, har vi sendt et login-link. Det virker i 30 minutter.'

// POST /api/auth/login  { email, next? } — sender magic link til aktive admins
export async function POST(request: Request) {
  let body: { email?: unknown; next?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ugyldig forespørgsel' }, { status: 400 }) }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Skriv en gyldig e-mail' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: admin, error } = await supabase.from('admin_users')
    .select('id, email, disabled_at').eq('email', email).maybeSingle()
  if (error) return NextResponse.json({ error: 'Login er ikke tilgængeligt lige nu' }, { status: 503 })
  if (!admin || admin.disabled_at) return NextResponse.json({ ok: true, message: SENT_MSG })

  const { count } = await supabase.from('admin_login_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', admin.id).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  if ((count ?? 0) >= MAX_PER_HOUR) return NextResponse.json({ ok: true, message: SENT_MSG })

  const token = newToken()
  const ins = await supabase.from('admin_login_tokens').insert({
    admin_user_id: admin.id, token_hash: hashToken(token),
    expires_at: new Date(Date.now() + ADMIN_TOKEN_MINUTES * 60_000).toISOString(),
  })
  if (ins.error) return NextResponse.json({ error: 'Login er ikke tilgængeligt lige nu' }, { status: 503 })

  const next = safeNext(body.next)
  const link = `${await siteUrl()}/login/bekraeft?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`
  const sent = await sendEmail(admin.email, 'Login til Kronborg Marine admin', `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;color:#111">
      <h2>Log ind på admin</h2>
      <p>Klik for at logge ind. Linket virker i ${ADMIN_TOKEN_MINUTES} minutter og kan kun bruges én gang.</p>
      <a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;
         border-radius:6px;text-decoration:none;font-weight:600">Log ind →</a>
      <p style="font-size:12px;color:#888">Har du ikke bedt om at logge ind, kan du se bort fra denne mail.</p>
    </div>`).catch(() => false)

  if (!sent) {
    // Nødadgang: kan mailen ikke sendes (fx domæne ikke verificeret), står linket i serverloggen
    console.error(`[admin-login] Mail kunne ikke sendes til ${admin.email}. Login-link (${ADMIN_TOKEN_MINUTES} min): ${link}`)
  }

  return NextResponse.json({
    ok: true,
    message: SENT_MSG,
    ...(process.env.NODE_ENV !== 'production' && !emailConfigured() ? { dev_link: link } : {}),
  })
}

// DELETE /api/auth/login — log ud
export async function DELETE() {
  await endAdminSession()
  return NextResponse.json({ ok: true })
}
