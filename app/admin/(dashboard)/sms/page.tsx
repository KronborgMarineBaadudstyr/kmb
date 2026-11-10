import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { encryptSecret } from '@/lib/secrets'
import { parseIdentifier } from '@/lib/shop/auth'
import { SMS_SETTING, DEFAULT_SENDER, resolveSmsConfig, checkSmsToken, sendSmsWith, validSender, type SmsConfig } from '@/lib/shop/sms'
import { ConfirmSubmit } from '../_confirm-submit'

export const dynamic = 'force-dynamic'

// Indstillinger → SMS (kun ejere): GatewayAPI-token til login med telefonnummer

async function requireOwner() {
  const me = await getCurrentAdmin()
  if (!me || me.role !== 'owner') redirect('/admin')
  return me
}
const back = (q: string) => redirect(`/admin/sms?${q}`)

async function saveConfig(formData: FormData) {
  'use server'
  const me     = await requireOwner()
  const token  = String(formData.get('token') ?? '').trim()
  const region = formData.get('region') === 'eu' ? 'eu' : 'com'
  const sender = String(formData.get('sender') ?? '').trim() || DEFAULT_SENDER
  if (token.length < 20 || /\s/.test(token)) back('err=' + encodeURIComponent('Det ligner ikke et GatewayAPI-token (kopiér hele token fra GatewayAPI under API → API Keys).'))
  if (!validSender(sender)) back('err=' + encodeURIComponent('Afsendernavnet må højst være 11 bogstaver/tal (eller et telefonnummer).'))

  const problem = await checkSmsToken({ token, region })
  if (problem) back('err=' + encodeURIComponent(problem))

  const cfg: SmsConfig = { token, region, sender }
  const { error } = await createServiceClient().from('app_settings').upsert({
    key: SMS_SETTING, value: encryptSecret(JSON.stringify(cfg)), hint: token.slice(-4),
    updated_at: new Date().toISOString(), updated_by: me.email,
  })
  if (error) back('err=' + encodeURIComponent('Kunne ikke gemme — er migration 061 kørt?'))
  revalidatePath('/admin/sms')
  back('ok=gemt')
}

async function removeConfig() {
  'use server'
  await requireOwner()
  const { error } = await createServiceClient().from('app_settings').delete().eq('key', SMS_SETTING)
  revalidatePath('/admin/sms')
  back(error ? 'err=Kunne+ikke+fjerne+opsætningen.' : 'ok=fjernet')
}

async function sendTest(formData: FormData) {
  'use server'
  await requireOwner()
  const id = parseIdentifier(String(formData.get('phone') ?? ''))
  if (!id || id.kind !== 'phone') back('err=' + encodeURIComponent('Skriv et gyldigt telefonnummer, fx 12345678 eller +4512345678.'))
  const { config } = await resolveSmsConfig()
  if (!config) back('err=' + encodeURIComponent('SMS er ikke sat op endnu.'))
  const err = await sendSmsWith(config!, id!.value, 'Test fra LoveSailing: SMS-login virker.')
  back(err ? 'err=' + encodeURIComponent(err) : 'ok=sendt&to=' + encodeURIComponent(id!.value))
}

const fmt = (d: string) => new Date(d).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const inputCls = 'w-full px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'

export default async function SmsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; to?: string }> }) {
  await requireOwner()
  const sp   = await searchParams
  const info = await resolveSmsConfig()
  const OK: Record<string, string> = {
    gemt:    '✓ Gemt. Login med telefonnummer sender nu SMS. Send en test-SMS herunder for at være sikker.',
    fjernet: 'SMS-opsætningen er fjernet. Login-links til telefonnumre sendes igen til kundens e-mail.',
    sendt:   `✓ Test-SMS sendt til ${sp.to ?? 'nummeret'}.`,
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">SMS (GatewayAPI)</h2>
        <p className="text-sm text-gray-500">
          Bruges når kunder logger ind med telefonnummer: de får login-linket på SMS. Uden opsætning sendes linket til
          kundens e-mail, hvis den kendes. Opret et API-token hos GatewayAPI under <em>API → API Keys</em>.
          Token gemmes krypteret og vises aldrig igen — kun de sidste 4 tegn.
        </p>
      </div>

      {sp.ok && OK[sp.ok] && <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">{OK[sp.ok]}</p>}
      {sp.err && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{sp.err}</p>}

      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Bruges nu</h3>
        {info.config ? (
          <p className="text-sm text-gray-700">
            {info.source === 'shop' ? 'Token gemt i admin' : <>Token fra serveropsætningen (<span className="font-mono">GATEWAYAPI_TOKEN</span>)</>}
            {' '}<span className="font-mono">…{info.hint}</span> · gatewayapi.{info.config.region} · afsender <strong>{info.config.sender}</strong>
            {info.source === 'shop' && info.updated_at && <span className="text-gray-500"> · gemt {fmt(info.updated_at)}{info.updated_by ? ` af ${info.updated_by}` : ''}</span>}
          </p>
        ) : <p className="text-sm text-amber-700">Ikke sat op — login-links til telefonnumre sendes til kundens e-mail.</p>}
        {info.unreadable && <p className="mt-2 text-sm text-red-700">Den gemte opsætning kan ikke læses (krypteringsnøglen er skiftet). Indtast token igen.</p>}

        {info.config && (
          <form action={sendTest} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
              Send test-SMS til
              <input name="phone" required inputMode="tel" placeholder="12345678" className={`${inputCls} w-48`} />
            </label>
            <ConfirmSubmit label="Send test" pendingLabel="Sender…"
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium disabled:opacity-40" />
          </form>
        )}
        {(info.source === 'shop' || info.unreadable) && (
          <form action={removeConfig} className="mt-3">
            <ConfirmSubmit label="Fjern opsætning" pendingLabel="Fjerner…"
              confirmText="Fjern GatewayAPI-opsætningen? Login-links til telefonnumre sendes derefter til e-mail."
              className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 font-medium disabled:opacity-40" />
          </form>
        )}
      </section>

      <form action={saveConfig} className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{info.source === 'shop' ? 'Skift opsætning' : 'Opsætning'}</h3>
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          API-token
          <input name="token" type="password" required autoComplete="off" spellCheck={false} className={`${inputCls} font-mono`} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
            Konto
            <select name="region" defaultValue={info.config?.region ?? 'com'} className={inputCls}>
              <option value="com">gatewayapi.com</option>
              <option value="eu">gatewayapi.eu (EU-konto)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
            Afsendernavn <span className="font-normal text-gray-400">— højst 11 tegn, vises som afsender</span>
            <input name="sender" defaultValue={info.config?.sender ?? DEFAULT_SENDER} maxLength={15} className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-gray-400">Token tjekkes hos GatewayAPI, før det gemmes.</p>
        <ConfirmSubmit label="Tjek og gem" pendingLabel="Tjekker…"
          className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-40" />
      </form>
    </div>
  )
}
