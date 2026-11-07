import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { INDUSTRY_GUIDE } from '@/lib/ai/knowledge'
import { SHOP_KNOWLEDGE_MAX } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'

const PLACEHOLDER = `Skriv det assistenten bør vide om jeres butik og kunder, fx:

- Vi har butik i Helsingør; mange kunder sejler i Øresund og Kattegat
- Sejlklubber køber samlet ind til sæsonstart i marts
- Vi holder altid efterårsudsalg i uge 42
- Redningsveste fra X sælger bedst; Y har problemer med returer
- Fri fragt fra 499 kr`

async function save(formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/login')
  const content = String(formData.get('content') ?? '').slice(0, SHOP_KNOWLEDGE_MAX)
  const { error } = await createServiceClient().from('ai_knowledge')
    .upsert({ id: 'shop', content, updated_at: new Date().toISOString(), updated_by: admin.email })
  revalidatePath('/admin/ai-viden')
  redirect(error ? '/admin/ai-viden?err=1' : '/admin/ai-viden?saved=1')
}

export default async function AiKnowledgePage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const sp = await searchParams
  const { data, error } = await createServiceClient().from('ai_knowledge')
    .select('content, updated_at, updated_by').eq('id', 'shop').maybeSingle()

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">AI-viden</h2>
      <p className="text-sm text-gray-500 mb-6">
        Det AI-assistenten ved om branchen og om jeres butik, ud over tallene. Den bruger det til at tolke salget
        og foreslå idéer, men lader altid jeres data afgøre konklusionen.
      </p>

      {sp.saved && <p className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">✓ Gemt — bruges fra næste spørgsmål.</p>}
      {(sp.err || error) && (
        <p className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">
          Kunne ikke {sp.err ? 'gemme' : 'hente'} butikkens viden{error ? `: ${error.message}` : ''}. Er migration 060 kørt?
        </p>
      )}

      <form action={save} className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Jeres egen viden</h3>
          {data?.updated_at && (
            <span className="text-xs text-gray-400">
              Senest ændret {new Date(data.updated_at).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}
              {data.updated_by ? ` af ${data.updated_by}` : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Erfaringer, kundetyper, faste kampagner, leverandørforhold — alt der hjælper med at forstå jeres tal.
          Vægter højere end det generelle branchekendskab. Skriv ikke persondata om enkeltkunder.
        </p>
        <textarea name="content" defaultValue={data?.content ?? ''} rows={14} maxLength={SHOP_KNOWLEDGE_MAX}
          placeholder={PLACEHOLDER}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex justify-end mt-3">
          <button className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 font-medium">Gem</button>
        </div>
      </form>

      <details className="bg-white rounded-lg border border-gray-200 group">
        <summary className="cursor-pointer px-5 py-4 font-semibold text-gray-900 list-none flex justify-between">
          Generelt branchekendskab
          <span className="text-xs font-normal text-gray-400 group-open:hidden">Vis</span>
        </summary>
        <div className="px-5 pb-5 text-sm text-gray-700 border-t border-gray-100 pt-4
          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_p]:my-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:font-semibold">
          <ReactMarkdown>{INDUSTRY_GUIDE}</ReactMarkdown>
          <p className="text-xs text-gray-400 mt-4">Vedligeholdes i koden (lib/ai/knowledge.ts). Tilføj jeres egne erfaringer ovenfor.</p>
        </div>
      </details>
    </div>
  )
}
