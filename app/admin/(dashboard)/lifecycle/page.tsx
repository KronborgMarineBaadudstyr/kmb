import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { emailConfigured, sendEmailBatch, escapeHtml, siteUrl, type Email } from '@/lib/shop/email'
import { LIFECYCLE_COLUMNS, type LifecycleRow, dueStatus, fmtDate, lifespanLabel, addDays } from '@/lib/shop/lifecycle'
import { ConfirmSubmit } from './_confirm-submit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WINDOWS = [30, 60, 90, 180]
const OVERDUE_DAYS = 90   // forfaldne inden for de sidste 90 dage tages med

function windowOf(v: unknown) {
  const n = Number(v)
  return WINDOWS.includes(n) ? n : 60
}

async function loadRows(days: number) {
  const { data, error } = await createServiceClient()
    .from('customer_product_lifecycle')
    .select(LIFECYCLE_COLUMNS)
    .gte('due_date', addDays(-OVERDUE_DAYS))
    .lte('due_date', addDays(days))
    .order('due_date')
    .limit(5000)
  return { rows: (data ?? []) as unknown as LifecycleRow[], error }
}

const canRemind = (r: LifecycleRow) => r.marketing_opt_in && !!r.email && !r.reminded_at

async function sendReminders(formData: FormData) {
  'use server'
  if (!(await isAdmin())) redirect('/login')
  const days = windowOf(formData.get('window'))
  if (!emailConfigured()) redirect(`/admin/lifecycle?window=${days}&err=noemail`)

  const { rows } = await loadRows(days)
  const byUser = new Map<string, LifecycleRow[]>()
  for (const r of rows.filter(canRemind)) byUser.set(r.shop_user_id, [...(byUser.get(r.shop_user_id) ?? []), r])
  if (byUser.size === 0) redirect(`/admin/lifecycle?window=${days}&sent=0`)

  const supabase = createServiceClient()
  const { data: users } = await supabase.from('shop_users')
    .select('id, unsubscribe_token').in('id', [...byUser.keys()])
  const unsub = new Map((users ?? []).map(u => [u.id, u.unsubscribe_token as string]))

  const site   = await siteUrl()
  const emails: (Email & { userId: string })[] = [...byUser.entries()].map(([userId, items]) => {
    const unsubUrl = `${site}/afmeld?t=${unsub.get(userId) ?? ''}`
    return {
      userId,
      to: items[0].email!,
      subject: items.length === 1
        ? `Tid til at tjekke: ${items[0].line_name}`
        : `${items.length} af dine produkter nærmer sig udskiftning`,
      html: reminderHtml(items, site, unsubUrl),
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
    }
  })

  const sent = await sendEmailBatch(emails) as (Email & { userId: string })[]
  const sentUsers = new Set(sent.map(e => e.userId))
  const records = [...byUser.entries()]
    .filter(([u]) => sentUsers.has(u))
    .flatMap(([, items]) => items.map(r => ({ shop_user_id: r.shop_user_id, order_id: r.order_id, product_id: r.product_id })))
  if (records.length) {
    await supabase.from('lifecycle_reminders')
      .upsert(records, { onConflict: 'shop_user_id,order_id,product_id', ignoreDuplicates: true })
  }
  const failed = emails.length - sent.length
  redirect(`/admin/lifecycle?window=${days}&sent=${sent.length}${failed ? `&failed=${failed}` : ''}`)
}

function reminderHtml(items: LifecycleRow[], site: string, unsubUrl: string) {
  const name = items[0].customer_name?.split(' ')[0]
  const rows = items.map(r => {
    const due = dueStatus(r.due_date)
    return `
      <tr>
        <td style="padding:10px 12px 10px 0;width:64px;vertical-align:top">
          ${r.image_url ? `<img src="${escapeHtml(r.image_url)}" width="56" height="56" style="object-fit:contain;border:1px solid #dde2ef;border-radius:8px" alt="">` : ''}
        </td>
        <td style="padding:10px 0;vertical-align:top;font-size:14px">
          <strong>${escapeHtml(r.line_name)}</strong><br>
          <span style="color:#6b7888;font-size:12px">Købt ${fmtDate(r.purchased_at)} · levetid ca. ${lifespanLabel(r.lifespan_months)}</span><br>
          <span style="color:${due.tone === 'overdue' ? '#b42318' : '#b45309'};font-size:13px;font-weight:600">${due.label}</span>
          ${r.lifespan_note ? `<br><span style="font-size:13px">${escapeHtml(r.lifespan_note)}</span>` : ''}
          <br><a href="${site}/produkt/${r.shop_product_id}" style="color:#FF8500;font-size:13px">Se produktet →</a>
        </td>
      </tr>`
  }).join('')
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#1a2543">
      <h2>${name ? `Hej ${escapeHtml(name)}` : 'Hej'}</h2>
      <p>Noget af det udstyr du har købt hos os, nærmer sig sin forventede levetid. Slidt udstyr kan svigte, når du har mest brug for det — så det er en god idé at tjekke det.</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p><a href="${site}/konto" style="color:#1a2543">Se alle dine produkter på Min konto</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:11px;color:#888">Du får denne mail, fordi du har sagt ja til nyheder og påmindelser fra LoveSailing.dk.
        <a href="${unsubUrl}" style="color:#888">Afmeld</a></p>
    </div>`
}

export default async function LifecyclePage({
  searchParams,
}: { searchParams: Promise<{ window?: string; sent?: string; failed?: string; err?: string }> }) {
  const sp   = await searchParams
  const days = windowOf(sp.window)
  const { rows, error } = await loadRows(days)

  const eligible   = rows.filter(canRemind)
  const custEligible = new Set(eligible.map(r => r.shop_user_id)).size
  const noConsent  = rows.filter(r => !r.reminded_at && r.email && !r.marketing_opt_in).length
  const phoneOnly  = rows.filter(r => !r.email).length
  const reminded   = rows.filter(r => r.reminded_at).length

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Udskiftninger</h2>
          <p className="text-sm text-gray-500">
            Købte produkter der når forventet levetid — forfaldne de sidste {OVERDUE_DAYS} dage og de næste {days} dage.
            Levetid sættes på produktet (Produkter → Levetid &amp; service).
          </p>
        </div>
        <nav className="flex gap-1.5 text-sm">
          {WINDOWS.map(w => (
            <a key={w} href={`/admin/lifecycle?window=${w}`}
              className={`px-3 py-1.5 rounded-md border ${w === days ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {w} dage
            </a>
          ))}
        </nav>
      </div>

      {sp.sent !== undefined && (
        <p className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">
          ✓ {sp.sent} påmindelser sendt{sp.failed ? ` — ${sp.failed} fejlede og kan sendes igen` : ''}.
        </p>
      )}
      {sp.err === 'noemail' && (
        <p className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">
          RESEND_API_KEY er ikke sat — der kan ikke sendes e-mails.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red-600">Kunne ikke hente data: {error.message}</p>}

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Klar til påmindelse', value: eligible.length, sub: `${custEligible} kunder` },
          { label: 'Mangler samtykke',    value: noConsent, sub: 'har e-mail, ikke sagt ja' },
          { label: 'Kun telefon',         value: phoneOnly, sub: 'ingen e-mail' },
          { label: 'Allerede påmindet',   value: reminded,  sub: 'sendes ikke igen' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
            <p className="text-xs text-gray-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <form action={sendReminders} className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex items-center justify-between gap-4">
        <input type="hidden" name="window" value={days} />
        <p className="text-sm text-gray-600">
          Sender én samlet e-mail pr. kunde med alle deres produkter i perioden. Kun kunder med samtykke og e-mail.
          Hvert produkt påmindes højst én gang.
        </p>
        <ConfirmSubmit
          label={`Send til ${custEligible} kunder`}
          confirmText={`Send påmindelse til ${custEligible} kunder (${eligible.length} produkter)?`}
          disabled={custEligible === 0} />
      </form>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Kunde</th>
              <th className="text-left px-4 py-2 font-medium">Produkt</th>
              <th className="text-left px-4 py-2 font-medium">Købt</th>
              <th className="text-left px-4 py-2 font-medium">Forfald</th>
              <th className="text-left px-4 py-2 font-medium">Påmindelse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                Ingen købte produkter forfalder i perioden. Har produkterne fået en levetid?
              </td></tr>
            )}
            {rows.map(r => {
              const due = dueStatus(r.due_date)
              const state = r.reminded_at ? { t: `Sendt ${fmtDate(r.reminded_at)}`, c: 'text-gray-400' }
                : !r.email ? { t: 'Kun telefon', c: 'text-gray-400' }
                : !r.marketing_opt_in ? { t: 'Mangler samtykke', c: 'text-orange-600' }
                : { t: 'Klar', c: 'text-green-700 font-medium' }
              return (
                <tr key={`${r.order_id}-${r.product_id}`}>
                  <td className="px-4 py-2">
                    <div className="text-gray-900">{r.customer_name ?? r.email ?? r.phone}</div>
                    {r.customer_name && <div className="text-xs text-gray-400">{r.email ?? r.phone}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <a href={`/admin/products/${r.product_id}`} className="text-gray-900 hover:text-blue-600">{r.line_name}</a>
                    <div className="text-xs text-gray-400">levetid {lifespanLabel(r.lifespan_months)}{r.qty > 1 ? ` · ${r.qty} stk.` : ''}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.purchased_at)}<div className="text-xs text-gray-400">{r.order_number}</div></td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={due.tone === 'overdue' ? 'text-red-600' : 'text-amber-700'}>{due.label}</span>
                  </td>
                  <td className={`px-4 py-2 whitespace-nowrap ${state.c}`}>{state.t}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
