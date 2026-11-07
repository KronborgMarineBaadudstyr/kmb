import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { TOOL_LABELS } from '@/lib/ai/tools'
import type { ChatItem } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'

type Block = { type: string; text?: string; name?: string }

// Gemte API-beskeder → det brugeren skal se (spørgsmål, svartekst og hvilke opslag AI'en lavede)
function toItems(rows: { role: string; content: unknown }[]): ChatItem[] {
  const items: ChatItem[] = []
  for (const r of rows) {
    const blocks = (Array.isArray(r.content) ? r.content : [{ type: 'text', text: String(r.content) }]) as Block[]
    if (r.role === 'user') {
      const texts = blocks.filter(b => b.type === 'text').map(b => b.text ?? '')
      if (texts.length) items.push({ role: 'user', text: texts[texts.length - 1], tools: [] })
      continue
    }
    const last = items[items.length - 1]
    const target = last?.role === 'assistant' ? last : (items.push({ role: 'assistant', text: '', tools: [] }), items[items.length - 1])
    for (const b of blocks) {
      if (b.type === 'text' && b.text) target.text += (target.text ? '\n\n' : '') + b.text
      if (b.type === 'tool_use' && b.name) target.tools.push(TOOL_LABELS[b.name] ?? b.name)
    }
  }
  return items
}

async function owned(id: string) {
  const admin = await getCurrentAdmin()
  if (!admin) return null
  const { data } = await createServiceClient().from('ai_conversations')
    .select('id, title').eq('id', id).eq('admin_user_id', admin.id).maybeSingle()
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conv = await owned(id)
  if (!conv) return Response.json({ error: 'Samtalen findes ikke' }, { status: 404 })
  const { data } = await createServiceClient().from('ai_messages').select('role, content')
    .eq('conversation_id', id).order('id')
  return Response.json({ data: { ...conv, items: toItems(data ?? []) } })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await owned(id))) return Response.json({ error: 'Samtalen findes ikke' }, { status: 404 })
  await createServiceClient().from('ai_conversations').delete().eq('id', id)
  return Response.json({ ok: true })
}
