import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { encryptSecret } from '@/lib/secrets'
import { SWEDBANK_SETTING, resolveSwedbankConfig, checkSwedbankConfig, type SwedbankConfig } from '@/lib/shop/swedbankpay'
import { ConfirmSubmit } from '../_confirm-submit'

export const dynamic = 'force-dynamic'

// Indstillinger → Betaling (kun ejere): Swedbank Pay — access token og Payee ID fra Merchant Portal
async function requireOwner() {
  const me = await getCurrentAdmin()
  if (!me || me.role !== 'owner') redirect('/admin')
  return me
}
const back = (q: string): never => redirect(`/admin/betaling?${q}`)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function saveConfig(formData: FormData) {
  'use server'
  const me = await requireOwner()
  const token   = String(formData.get('token') ?? '').trim()
  const payeeId = String(formData.get('payeeId') ?? '').trim()
  const env     = formData.get('env') === 'prod' ? 'prod' : 'test'
  const payeeName = String(formData.get('payeeName') ?? '').trim().slice(0, 40) || 'LoveSailing'
  if (!UUID.test(payeeId)) back('err=' + encodeURIComponent('Payee ID skal se sådan ud: 5cabf558-5283-482f-b252-4d58e06f6f3b (findes under Merchant details i Merchant Portal).'))
  if (token.length < 20 || /\s/.test(token)) back('err=' + encodeURIComponent('Det ligner ikke et access token — kopiér hele token fra Merchant Portal.'))
  const cfg: SwedbankConfig = { token, payeeId, env, payeeName }
  const problem = await checkSwedbankConfig(cfg)
  if (problem) back('err=' + encodeURIComponent(problem))
  const { error } = await createServiceClient().from('app_settings').upsert({
    key: SWEDBANK_SETTING, value: encryptSecret(JSON.stringify(cfg)), hint: token.slice(-4),
    updated_at: new Date().toISOString(), updated_by: me.email,
  })
  if (error) back('err=' + encodeURIComponent('Kunne ikke gemme — er migration 061 kørt?'))
  revalidatePath('/admin/betaling')
  back('ok=gemt')
}

async function removeConfig() {
  'use server'
  await requireOwner()
  const { error } = await createServiceClient().from('app_settings').delete().eq('key', SWEDBANK_SETTING)
  revalidatePath('/admin/betaling')
  back(error ? 'err=Kunne+ikke+fjerne+opsætningen.' : 'ok=fjernet')
}

const fmt = (d: string) => new Date(d).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const inputCls = 'w-full px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'

export default async function PaymentSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireOwner()
  const sp = await searchParams
  const info = await resolveSwedbankConfig()
  const c = info.config
  const OK: Record<string, string> = {
    gemt:    c?.env === 'prod'
      ? '✓ Gemt. Online betaling er åben for alle kunder i checkout.'
      : '✓ Gemt i testmiljøet. Online betaling vises kun for dig og andre admins — test med et testkort (fx 5226 6121 9953 3406, vilkårlig udløb/CVC).',
    fjernet: 'Opsætningen er fjernet — online betaling er lukket.',
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Betaling (Swedbank Pay)</h2>
        <p className="text-sm text-gray-500">
          Kort og MobilePay i checkout. Beløbet reserveres ved køb og trækkes først, når ordren markeres &quot;Sendt til kunden&quot; eller
          &quot;Afhentet&quot; (annulleres ordren, frigives reservationen). Access token og Payee ID findes i Swedbank Pays Merchant Portal under
          <em> Merchant details</em> — brug testportalen (External Integration) først.
        </p>
      </div>

      {sp.ok && OK[sp.ok] && <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">{OK[sp.ok]}</p>}
      {sp.err && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{sp.err}</p>}

      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Status</h3>
        {c ? (
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              {c.env === 'prod'
                ? <span className="font-semibold text-green-700">● Produktion — åben for alle kunder</span>
                : <span className="font-semibold text-amber-700">● Testmiljø — kun synlig for admins i checkout</span>}
            </p>
            <p>Payee ID <span className="font-mono">{c.payeeId}</span> · token <span className="font-mono">…{info.hint}</span>{c.payeeName ? ` · ${c.payeeName}` : ''}</p>
            {info.source === 'env' && <p className="text-gray-500">Fra serveropsætningen (SWEDBANK_PAY_TOKEN / SWEDBANK_PAY_PAYEE_ID).</p>}
            {info.source === 'shop' && info.updated_at && <p className="text-gray-500">Gemt {fmt(info.updated_at)}{info.updated_by ? ` af ${info.updated_by}` : ''}</p>}
          </div>
        ) : <p className="text-sm text-amber-700">Ikke sat op — online betaling er lukket i checkout (kun betal ved afhentning for kendte kunder).</p>}
        {info.unreadable && <p className="mt-2 text-sm text-red-700">Den gemte opsætning kan ikke læses (krypteringsnøglen er skiftet). Indtast den igen.</p>}
        {(info.source === 'shop' || info.unreadable) && (
          <form action={removeConfig} className="mt-4">
            <ConfirmSubmit label="Fjern opsætning" pendingLabel="Fjerner…"
              confirmText="Fjern Swedbank Pay-opsætningen? Online betaling lukkes i checkout."
              className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 font-medium disabled:opacity-40" />
          </form>
        )}
      </section>

      <form action={saveConfig} className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{c ? 'Skift opsætning' : 'Opsætning'}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
            Miljø
            <select name="env" defaultValue={c?.env ?? 'test'} className={inputCls}>
              <option value="test">Test (External Integration) — kun admins</option>
              <option value="prod">Produktion — rigtige betalinger</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
            Navn på betalingssiden
            <input name="payeeName" defaultValue={c?.payeeName ?? 'LoveSailing'} maxLength={40} className={inputCls} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          Payee ID
          <input name="payeeId" required defaultValue={c?.payeeId ?? ''} placeholder="5cabf558-5283-482f-b252-4d58e06f6f3b" spellCheck={false} className={`${inputCls} font-mono`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          Access token
          <input name="token" type="password" required autoComplete="off" spellCheck={false} className={`${inputCls} font-mono`} />
        </label>
        <p className="text-xs text-gray-400">Token tjekkes hos Swedbank Pay, før det gemmes, og gemmes krypteret — det vises aldrig igen.</p>
        <ConfirmSubmit label="Tjek og gem" pendingLabel="Tjekker…"
          className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-40" />
      </form>
    </div>
  )
}
