'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatItem } from '@/lib/ai/config'

type Conversation = { id: string; title: string | null; updated_at: string }

const EXAMPLES = [
  'Hvordan ville salget se ud, hvis vi solgte vores mest solgte fender i pakker af 2 til 75 kr i stedet for 45 kr pr. stk.?',
  'Hvilke varer købes oftest sammen, og hvilke pakketilbud giver det idé til?',
  'Hvilke produkter bør vi have på lager og i kampagner op til næste måned?',
  'Hvor meget salgsdata har vi, og hvor sikre kan dine analyser være?',
]

// Markdown uden rå HTML; Tailwind nulstiller standard-styling, så elementerne styles her
const md = {
  p:      (p: React.ComponentProps<'p'>) => <p className="my-2 leading-relaxed" {...p} />,
  ul:     (p: React.ComponentProps<'ul'>) => <ul className="my-2 list-disc pl-5 space-y-1" {...p} />,
  ol:     (p: React.ComponentProps<'ol'>) => <ol className="my-2 list-decimal pl-5 space-y-1" {...p} />,
  h1:     (p: React.ComponentProps<'h1'>) => <h3 className="mt-4 mb-2 font-semibold text-gray-900" {...p} />,
  h2:     (p: React.ComponentProps<'h2'>) => <h3 className="mt-4 mb-2 font-semibold text-gray-900" {...p} />,
  h3:     (p: React.ComponentProps<'h3'>) => <h4 className="mt-3 mb-1 font-semibold text-gray-900" {...p} />,
  strong: (p: React.ComponentProps<'strong'>) => <strong className="font-semibold text-gray-900" {...p} />,
  table:  (p: React.ComponentProps<'table'>) => <div className="my-3 overflow-x-auto"><table className="text-sm border-collapse" {...p} /></div>,
  th:     (p: React.ComponentProps<'th'>) => <th className="border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left font-medium" {...p} />,
  td:     (p: React.ComponentProps<'td'>) => <td className="border border-gray-200 px-2.5 py-1.5 tabular-nums" {...p} />,
  code:   (p: React.ComponentProps<'code'>) => <code className="bg-gray-100 rounded px-1 text-[0.9em]" {...p} />,
  a:      (p: React.ComponentProps<'a'>) => <a className="text-blue-600 underline" target="_blank" rel="noopener noreferrer" {...p} />,
}

function Answer({ text }: { text: string }) {
  return <div className="text-sm text-gray-800"><ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{text}</ReactMarkdown></div>
}

function Tools({ tools, live }: { tools: string[]; live?: boolean }) {
  if (!tools.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tools.map((t, i) => (
        <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${
          live && i === tools.length - 1 ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
          {t}{live && i === tools.length - 1 ? '…' : ''}
        </span>
      ))}
    </div>
  )
}

export function Chat({ initialQuestion }: { initialQuestion?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items,    setItems]    = useState<ChatItem[]>([])
  const [input,    setInput]    = useState(initialQuestion ?? '')
  const [busy,     setBusy]     = useState(false)
  const [live,     setLive]     = useState<{ text: string; tools: string[] } | null>(null)
  const [error,    setError]    = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  async function loadConversations() {
    const res = await fetch('/api/ai/conversations')
    if (res.ok) setConversations((await res.json()).data ?? [])
  }
  useEffect(() => { loadConversations() }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [items, live])

  async function open(id: string) {
    if (busy) return
    setError(''); setActiveId(id); setItems([])
    const res = await fetch(`/api/ai/conversations/${id}`)
    if (res.ok) setItems((await res.json()).data.items)
  }

  function newConversation() {
    if (busy) return
    setActiveId(null); setItems([]); setError(''); setInput('')
  }

  async function remove(id: string) {
    if (!confirm('Slet samtalen?')) return
    await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' })
    if (id === activeId) newConversation()
    loadConversations()
  }

  async function send(question = input) {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true); setError(''); setInput('')
    setItems(prev => [...prev, { role: 'user', text: q, tools: [] }])
    const acc = { text: '', tools: [] as string[] }
    setLive({ ...acc })
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeId, message: q }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Noget gik galt')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() ?? ''
        for (const ev of events) {
          if (!ev.startsWith('data: ')) continue
          const e = JSON.parse(ev.slice(6))
          if (e.type === 'start') setActiveId(e.conversation_id)
          if (e.type === 'text')  acc.text += e.delta
          if (e.type === 'tool')  { if (acc.text && !acc.text.endsWith('\n\n')) acc.text += '\n\n'; acc.tools.push(e.label) }
          if (e.type === 'error') setError(e.message)
          setLive({ text: acc.text, tools: [...acc.tools] })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netværksfejl')
    } finally {
      if (acc.text || acc.tools.length) setItems(prev => [...prev, { role: 'assistant', text: acc.text, tools: acc.tools }])
      setLive(null); setBusy(false)
      loadConversations()
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <button onClick={newConversation} disabled={busy}
            className="w-full px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-40">
            + Ny samtale
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && <p className="text-xs text-gray-400 px-2 py-3">Ingen tidligere samtaler</p>}
          {conversations.map(c => (
            <div key={c.id} className={`group flex items-center rounded-md ${c.id === activeId ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              <button onClick={() => open(c.id)} className="flex-1 min-w-0 text-left px-2 py-1.5">
                <span className="block text-sm text-gray-800 truncate">{c.title ?? 'Samtale'}</span>
                <span className="block text-[11px] text-gray-400">{new Date(c.updated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}</span>
              </button>
              <button onClick={() => remove(c.id)} title="Slet"
                className="opacity-0 group-hover:opacity-100 px-2 text-gray-300 hover:text-red-500">×</button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col bg-gray-50">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {items.length === 0 && !live && (
              <div className="pt-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">AI-assistent</h2>
                <p className="text-sm text-gray-500 mb-5">
                  Spørg om salget, prissætning, pakketilbud og kampagner. Assistenten slår op i jeres salgsdata og
                  regner scenarier igennem — og siger, hvor sikkert svaret er.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXAMPLES.map(ex => (
                    <button key={ex} onClick={() => send(ex)}
                      className="text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2.5 hover:border-gray-400">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {items.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-gray-900 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 whitespace-pre-wrap">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-5 py-4">
                <Tools tools={m.tools} />
                <Answer text={m.text} />
              </div>
            ))}

            {live && (
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-5 py-4">
                <Tools tools={live.tools} live={!live.text || live.text.endsWith('\n\n')} />
                {live.text ? <Answer text={live.text} /> : <p className="text-sm text-gray-400">Tænker…</p>}
              </div>
            )}

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div ref={bottom} />
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); send() }} className="border-t border-gray-200 bg-white px-6 py-3">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={busy}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Stil et spørgsmål om salget… (Enter sender, Shift+Enter ny linje)"
              className="flex-1 resize-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
            <button type="submit" disabled={busy || !input.trim()}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 font-medium">
              {busy ? 'Arbejder…' : 'Send'}
            </button>
          </div>
          <p className="max-w-3xl mx-auto text-[11px] text-gray-400 mt-1.5">
            Svarene bygger på jeres salgsdata og er estimater — tjek tallene, før I træffer store beslutninger.
          </p>
        </form>
      </section>
    </div>
  )
}
