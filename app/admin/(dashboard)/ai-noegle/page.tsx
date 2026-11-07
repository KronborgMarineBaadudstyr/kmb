import Anthropic from '@anthropic-ai/sdk'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { encryptSecret } from '@/lib/secrets'
import { ANTHROPIC_SETTING, resolveAnthropicKey } from '@/lib/ai/key'
import { ConfirmSubmit } from '../_confirm-submit'

export const dynamic = 'force-dynamic'

async function requireOwner() {
  const me = await getCurrentAdmin()
  if (!me || me.role !== 'owner') redirect('/admin')
  return me
}

// Prøver nøglen mod Anthropic (gratis kald) — null = ok, ellers en fejltekst
async function checkKey(key: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15000 }).models.list({ limit: 1 })
    return null
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return 'Anthropic afviste nøglen — tjek at den er kopieret helt.'
    if (err instanceof Anthropic.PermissionDeniedError) return 'Nøglen har ikke adgang til API\'et.'
    if (err instanceof Anthropic.APIError && err.status) return `Anthropic svarede med en fejl (${err.status}) — prøv igen om lidt.`
    return 'Kunne ikke nå Anthropic — prøv igen om lidt.'
  }
}

async function saveKey(formData: FormData) {
  'use server'
  const me  = await requireOwner()
  const key = String(formData.get('key') ?? '').trim()
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) redirect('/admin/ai-noegle?err=format')

  const problem = await checkKey(key)
  if (problem) redirect(`/admin/ai-noegle?err=${encodeURIComponent(problem)}`)

  const { error } = await createServiceClient().from('app_settings').upsert({
    key: ANTHROPIC_SETTING, value: encryptSecret(key), hint: key.slice(-4),
    updated_at: new Date().toISOString(), updated_by: me.email,
  })
  if (error) redirect(`/admin/ai-noegle?err=${encodeURIComponent(
    error.code === '42P01' || error.code === 'PGRST205' ? 'Tabellen app_settings findes ikke — kør migration 061 først.' : 'Kunne ikke gemme nøglen.')}`)
  revalidatePath('/admin/ai-noegle')
  redirect('/admin/ai-noegle?ok=gemt')
}

async function removeKey() {
  'use server'
  await requireOwner()
  const { error } = await createServiceClient().from('app_settings').delete().eq('key', ANTHROPIC_SETTING)
  revalidatePath('/admin/ai-noegle')
  redirect(error ? '/admin/ai-noegle?err=Kunne+ikke+fjerne+nøglen.' : '/admin/ai-noegle?ok=fjernet')
}

async function testKey() {
  'use server'
  await requireOwner()
  const { key } = await resolveAnthropicKey()
  if (!key) redirect('/admin/ai-noegle?err=Der+er+ingen+nøgle+at+teste.')
  const problem = await checkKey(key)
  redirect(problem ? `/admin/ai-noegle?err=${encodeURIComponent(problem)}` : '/admin/ai-noegle?ok=virker')
}

const OK: Record<string, string> = {
  gemt:    '✓ Nøglen virker og er gemt. Al AI i systemet bruger nu butikkens egen nøgle.',
  fjernet: 'Butikkens nøgle er fjernet.',
  virker:  '✓ Nøglen virker.',
}

const fmt = (d: string) => new Date(d).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function AiKeyPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireOwner()
  const sp   = await searchParams
  const info = await resolveAnthropicKey()
  const err  = sp.err === 'format' ? 'Det ligner ikke en Anthropic-nøgle (den starter med "sk-ant-").' : sp.err

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">AI-nøgle</h2>
      <p className="text-sm text-gray-500 mb-6">
        AI-assistenten og forslag til produkttyper/kategorier kører på en Anthropic API-nøgle. Indtast butikkens
        egen nøgle, så forbruget faktureres på jeres egen Anthropic-konto. Nøglen gemmes krypteret og vises aldrig
        igen — kun de sidste 4 tegn. Opret en nøgle på console.anthropic.com under API Keys.
      </p>

      {sp.ok && OK[sp.ok] && <p className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">{OK[sp.ok]}</p>}
      {err && <p className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{err}</p>}

      <section className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Bruges nu</h3>
        {info.source === 'shop' && (
          <p className="text-sm text-gray-700">
            Butikkens egen nøgle <span className="font-mono">…{info.hint}</span>
            {info.updated_at && <span className="text-gray-500"> · gemt {fmt(info.updated_at)}{info.updated_by ? ` af ${info.updated_by}` : ''}</span>}
          </p>
        )}
        {info.source === 'env' && (
          <p className="text-sm text-gray-700">
            Standardnøglen fra serveropsætningen (<span className="font-mono">ANTHROPIC_API_KEY</span>, …{info.hint}).
            <span className="text-gray-500"> Den tilhører ikke nødvendigvis butikken.</span>
          </p>
        )}
        {info.source === null && <p className="text-sm text-amber-700">Ingen nøgle — AI-funktionerne er slået fra.</p>}
        {info.unreadable && (
          <p className="mt-2 text-sm text-red-700">
            Den gemte nøgle kan ikke læses (krypteringsnøglen på serveren er skiftet). Indtast nøglen igen.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {info.source && (
            <form action={testKey}>
              <ConfirmSubmit label="Test nøgle" pendingLabel="Tester…"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium disabled:opacity-40" />
            </form>
          )}
          {(info.source === 'shop' || info.unreadable) && (
            <form action={removeKey}>
              <ConfirmSubmit label="Fjern butikkens nøgle" pendingLabel="Fjerner…"
                confirmText="Fjern butikkens Anthropic-nøgle? AI bruger derefter standardnøglen, hvis den findes."
                className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 font-medium disabled:opacity-40" />
            </form>
          )}
        </div>
      </section>

      <form action={saveKey} className="bg-white rounded-lg border border-gray-200 p-5">
        <label className="flex flex-col gap-1 text-xs text-gray-500 font-medium">
          {info.source === 'shop' ? 'Skift til en ny nøgle' : 'Butikkens Anthropic-nøgle'}
          <input name="key" type="password" required autoComplete="off" spellCheck={false} placeholder="sk-ant-…"
            className="w-full px-3 py-1.5 text-sm font-mono text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <p className="mt-2 text-xs text-gray-400">Nøglen testes mod Anthropic, før den gemmes.</p>
        <div className="mt-3">
          <ConfirmSubmit label="Test og gem" pendingLabel="Tester…"
            className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-40" />
        </div>
      </form>
    </div>
  )
}
