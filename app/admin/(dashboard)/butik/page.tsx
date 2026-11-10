import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { cleanStoreInput, getStoreSettings, missingStoreFields } from '@/lib/shop/store'
import { PendingSubmit } from '@/app/_components/pending-submit'

export const dynamic = 'force-dynamic'

async function save(formData: FormData) {
  'use server'
  const me = await getCurrentAdmin()
  if (!me) redirect('/login')
  const input = cleanStoreInput(Object.fromEntries(formData.entries()))
  if (typeof input === 'string') redirect(`/admin/butik?err=${encodeURIComponent(input)}`)
  const { error } = await createServiceClient().from('store_settings').upsert({
    id: 'store', data: input, updated_at: new Date().toISOString(), updated_by: me.email,
  })
  if (error) {
    const msg = /store_settings/.test(error.message) ? 'Kør migration 067_store_settings.sql i Supabase først' : error.message
    redirect(`/admin/butik?err=${encodeURIComponent(msg)}`)
  }
  revalidatePath('/handelsbetingelser')
  redirect('/admin/butik?ok=1')
}

const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, name, value, placeholder, hint }: { label: string; name: string; value: string | null; placeholder?: string; hint?: string }) {
  return (
    <label className="block text-xs font-semibold text-gray-700 space-y-1">
      <span>{label}{hint && <span className="font-normal text-gray-400"> — {hint}</span>}</span>
      <input name={name} defaultValue={value ?? ''} placeholder={placeholder} className={inputCls} />
    </label>
  )
}

export default async function StoreSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams
  const { store, updatedAt } = await getStoreSettings()
  const missing = missingStoreFields(store)

  return (
    <div className="p-8 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Butiksoplysninger</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vises i <Link href="/handelsbetingelser" target="_blank" className="text-blue-600 hover:underline">handelsbetingelserne ↗</Link>,
          sidefoden i shoppen, på kvitteringen og i ordremails.
          {updatedAt && <> Sidst gemt {new Date(updatedAt).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' })}.</>}
        </p>
      </div>

      {ok && <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">Gemt.</p>}
      {err && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{err}</p>}
      {missing.length > 0 && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2">
          Handelsbetingelserne mangler: <strong>{missing.join(', ')}</strong>. Loven kræver, at kunden kan se, hvem de handler med, og hvordan de kontakter jer.
        </p>
      )}

      <form action={save} className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900 mb-1">Virksomhed</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Butikkens navn *" name="name" value={store.name} />
            <Field label="Juridisk navn" name="legalName" value={store.legalName} hint="hvis det er et andet" placeholder="fx Kronborg Marine ApS" />
            <Field label="CVR-nummer" name="cvr" value={store.cvr} placeholder="12345678" />
            <Field label="Adresse" name="address" value={store.address} placeholder="Havnevej 1, 3000 Helsingør" />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900 mb-1">Kontakt og afhentning</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="E-mail til kunder" name="email" value={store.email} placeholder="info@lovesailing.dk" hint="også til fortrydelse og reklamation" />
            <Field label="Telefon" name="phone" value={store.phone} placeholder="12 34 56 78" />
            <Field label="Åbningstider" name="openingHours" value={store.openingHours} placeholder="Man–fre 9–17, lør 9–13" />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900 mb-1">Levering og retur</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Leveringstid" name="deliveryTime" value={store.deliveryTime} placeholder="1–3 hverdage" hint="for varer på lager" />
            <label className="block text-xs font-semibold text-gray-700 space-y-1">
              <span>Returfragt ved fortrydelse</span>
              <select name="returnShipping" defaultValue={store.returnShipping} className={inputCls}>
                <option value="customer">Kunden betaler returfragten</option>
                <option value="shop">Vi betaler returfragten</option>
              </select>
            </label>
          </div>
        </fieldset>

        <PendingSubmit label="Gem" pendingLabel="Gemmer…" className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-60" />
      </form>
    </div>
  )
}
