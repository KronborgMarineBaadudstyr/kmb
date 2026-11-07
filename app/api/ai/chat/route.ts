import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { AI_MODEL, AI_EFFORT, MAX_TOOL_ROUNDS, SYSTEM_PROMPT } from '@/lib/ai/config'
import { TOOLS, TOOL_LABELS, runTool } from '@/lib/ai/tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/ai/chat  { conversation_id?, message } → SSE: text | tool | done | error
export async function POST(request: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI-assistenten er ikke sat op (ANTHROPIC_API_KEY mangler)' }, { status: 503 })
  }

  let body: { conversation_id?: unknown; message?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Ugyldig forespørgsel' }, { status: 400 }) }
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 8000) : ''
  if (!text) return Response.json({ error: 'Skriv et spørgsmål' }, { status: 400 })

  const supabase = createServiceClient()
  let conversationId = typeof body.conversation_id === 'string' && UUID.test(body.conversation_id) ? body.conversation_id : null
  if (conversationId) {
    const { data } = await supabase.from('ai_conversations').select('id')
      .eq('id', conversationId).eq('admin_user_id', admin.id).maybeSingle()
    if (!data) return Response.json({ error: 'Samtalen findes ikke' }, { status: 404 })
  } else {
    const { data, error } = await supabase.from('ai_conversations')
      .insert({ admin_user_id: admin.id, title: text.slice(0, 80) }).select('id').single()
    if (error || !data) return Response.json({ error: 'Kunne ikke oprette samtale' }, { status: 500 })
    conversationId = data.id
  }

  const { data: rows } = await supabase.from('ai_messages').select('role, content')
    .eq('conversation_id', conversationId).order('id')
  const messages: Anthropic.MessageParam[] = (rows ?? []).map(r => ({ role: r.role, content: r.content }))

  const save = async (role: 'user' | 'assistant', content: unknown) => {
    await supabase.from('ai_messages').insert({ conversation_id: conversationId, role, content })
  }

  // Datoen står i brugerens tur (ikke i systemprompten), så den cachede prompt ikke ændrer sig dagligt
  const today = new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const userContent: Anthropic.TextBlockParam[] = [
    { type: 'text', text: `(I dag er ${today}.)` },
    { type: 'text', text },
  ]
  messages.push({ role: 'user', content: userContent })
  await save('user', userContent)

  const encoder = new TextEncoder()
  const client  = new Anthropic()

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (data: object) => ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      send({ type: 'start', conversation_id: conversationId })
      try {
        let jsonRetries = 0
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const s = client.messages.stream({
            model: AI_MODEL,
            max_tokens: 64000,
            output_config: { effort: AI_EFFORT },
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            tools: TOOLS,
            cache_control: { type: 'ephemeral' },
            messages,
          })
          s.on('text', delta => send({ type: 'text', delta }))

          let message: Anthropic.Message
          try {
            message = await s.finalMessage()
            jsonRetries = 0
          } catch (err) {
            // Kun et værktøjsinput der ikke kunne parses, prøves igen — API-fejl sendes videre
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err
            continue
          }

          const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

          if (message.stop_reason === 'refusal') {
            // Et afvist svar kan have et afbrudt værktøjskald — gem det ikke, så samtalen kan fortsætte
            if (toolUses.length === 0) { messages.push({ role: 'assistant', content: message.content }); await save('assistant', message.content) }
            send({ type: 'error', message: 'AI-modellen afviste at svare på dette. Prøv at omformulere spørgsmålet.' })
            break
          }
          if (message.stop_reason === 'max_tokens' && toolUses.length > 0) {
            send({ type: 'error', message: 'Svaret blev for langt og blev afbrudt. Prøv et mere afgrænset spørgsmål.' })
            break
          }

          messages.push({ role: 'assistant', content: message.content })
          await save('assistant', message.content)

          if (message.stop_reason === 'pause_turn') continue
          if (toolUses.length === 0) break

          for (const t of toolUses) send({ type: 'tool', name: t.name, label: TOOL_LABELS[t.name] ?? t.name })
          const results = await Promise.all(toolUses.map(async t => {
            const r = await runTool(t.name, t.input)
            return { type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.isError } satisfies Anthropic.ToolResultBlockParam
          }))
          messages.push({ role: 'user', content: results })
          await save('user', results)

          if (round === MAX_TOOL_ROUNDS - 1) {
            send({ type: 'error', message: 'Analysen brugte for mange opslag og blev stoppet. Prøv et mere afgrænset spørgsmål.' })
          }
        }
        await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
        send({ type: 'done', conversation_id: conversationId })
      } catch (err) {
        console.error('[ai-chat]', err)
        const message =
          err instanceof Anthropic.AuthenticationError ? 'API-nøglen til AI-assistenten virker ikke.' :
          err instanceof Anthropic.RateLimitError      ? 'AI-tjenesten er overbelastet lige nu. Prøv igen om lidt.' :
          err instanceof Anthropic.APIError            ? `AI-tjenesten svarede med en fejl (${err.status}).` :
                                                         'Der opstod en fejl. Prøv igen.'
        send({ type: 'error', message })
      } finally {
        ctrl.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  })
}
