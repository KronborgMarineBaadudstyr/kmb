import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { sendEmail, escapeHtml, siteUrl } from '@/lib/shop/email'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; email: string; name: string | null; role: 'owner' | 'admin'
  disabled_at: string | null; last_login_at: string | null; created_at: string
}

const ROLES = { owner: 'Ejer', admin: 'Admin' } as const

async function requireOwner() {
  const me = await getCurrentAdmin()
  if (!me || me.role !== 'owner') redirect('/admin')
  return me
}

async function addAdmin(formData: FormData) {
  'use server'
  const me    = await requireOwner()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name  = String(formData.get('name') ?? '').trim() || null
  const role  = formData.get('role') === 'owner' ? 'owner' : 'admin'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/admin/admins?err=email')

  const { error } = await createServiceClient().from('admin_users')
    .insert({ email, name, role, created_by: me.id })
  if (error) redirect(`/admin/admins?err=${error.code === '23505' ? 'findes' : 'db'}`)

  const sent = await sendEmail(email, 'Du er oprettet som administrator — Kronborg Marine', `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;color:#111">
      <h2>Velkommen${name ? ` ${escapeHtml(name.split(' ')[0])}` : ''}</h2>
      <p>${escapeHtml(me.email)} har oprettet dig som ${ROLES[role].toLowerCase()} i Kronborg Marines admin.</p>
      <p>Log ind med denne e-mail — du får et login-link tilsendt, ingen adgangskode.</p>
      <a href="${siteUrl()}/login" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#111827;color:#fff;
         border-radius:6px;text-decoration:none;font-weight:600">Gå til login →</a>
    </div>`).catch(() => false)
  revalidatePath('/admin/admins')
  redirect(`/admin/admins?ok=${sent ? 'inviteret' : 'oprettet'}`)
}

async function updateAdmin(formData: FormData) {
  'use server'
  const me     = await requireOwner()
  const id     = String(formData.get('id') ?? '')
  const action = String(formData.get('action') ?? '')
  if (!id || id === me.id) redirect('/admin/admins?err=selv')

  const supabase = createServiceClient()
  if (action === 'disable') {
    await supabase.from('admin_users').update({ disabled_at: new Date().toISOString() }).eq('id', id)
    await supabase.from('admin_sessions').delete().eq('admin_user_id', id)
  } else if (action === 'enable') {
    await supabase.from('admin_users').update({ disabled_at: null }).eq('id', id)
  } else if (action === 'owner' || action === 'admin') {
    await supabase.from('admin_users').update({ role: action }).eq('id', id)
  }
  revalidatePath('/admin/admins')
  redirect('/admin/admins')
}

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  'ok:inviteret': { text: '✓ Admin oprettet og inviteret på e-mail', ok: true },
  'ok:oprettet':  { text: '✓ Admin oprettet — invitationsmailen kunne ikke sendes, giv selv besked', ok: true },
  'err:email':    { text: 'Ugyldig e-mail', ok: false },
  'err:findes':   { text: 'Der findes allerede en admin med den e-mail', ok: false },
  'err:db':       { text: 'Kunne ikke oprette admin — prøv igen', ok: false },
  'err:selv':     { text: 'Du kan ikke ændre din egen rolle eller deaktivere dig selv', ok: false },
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireOwner()
  const sp = await searchParams
  const msg = sp.ok ? MESSAGES[`ok:${sp.ok}`] : sp.err ? MESSAGES[`err:${sp.err}`] : null

  const { data, error } = await createServiceClient().from('admin_users')
    .select('id, email, name, role, disabled_at, last_login_at, created_at')
    .order('created_at')
  const admins = (data ?? []) as Row[]

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Administratorer</h2>
      <p className="text-sm text-gray-500 mb-6">
        Admins logger ind med e-mail og login-link. Ejere kan oprette, ændre og deaktivere admins.
      </p>

      {msg && (
        <p className={`mb-4 text-sm rounded-lg px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {msg.text}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red-600">Kunne ikke hente admins: {error.message}</p>}

      <form action={addAdmin} className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex gap-2 items-end flex-wrap">
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          E-mail
          <input name="email" type="email" required placeholder="navn@firma.dk"
            className="w-64 px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          Navn (valgfrit)
          <input name="name" className="w-48 px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          Rolle
          <select name="role" defaultValue="admin" className="px-2 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md">
            <option value="admin">Admin</option>
            <option value="owner">Ejer</option>
          </select>
        </label>
        <button className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium">
          Opret og inviter
        </button>
      </form>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Admin</th>
              <th className="text-left px-4 py-2 font-medium">Rolle</th>
              <th className="text-left px-4 py-2 font-medium">Sidst logget ind</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {admins.map(a => {
              const self = a.id === me.id
              return (
                <tr key={a.id} className={a.disabled_at ? 'opacity-50' : ''}>
                  <td className="px-4 py-2">
                    <div className="text-gray-900">{a.name ?? a.email}{self && <span className="ml-2 text-xs text-gray-400">(dig)</span>}</div>
                    {a.name && <div className="text-xs text-gray-400">{a.email}</div>}
                  </td>
                  <td className="px-4 py-2">{ROLES[a.role]}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmt(a.last_login_at)}</td>
                  <td className="px-4 py-2">{a.disabled_at ? <span className="text-red-600">Deaktiveret</span> : <span className="text-green-700">Aktiv</span>}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {!self && (
                      <form action={updateAdmin} className="inline-flex gap-1.5">
                        <input type="hidden" name="id" value={a.id} />
                        <button name="action" value={a.role === 'owner' ? 'admin' : 'owner'}
                          className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
                          {a.role === 'owner' ? 'Gør til admin' : 'Gør til ejer'}
                        </button>
                        <button name="action" value={a.disabled_at ? 'enable' : 'disable'}
                          className={`px-2 py-1 text-xs border rounded-md ${a.disabled_at ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-red-300 text-red-700 hover:bg-red-50'}`}>
                          {a.disabled_at ? 'Genaktiver' : 'Deaktiver'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
