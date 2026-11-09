'use client'

import { useEffect, useState } from 'react'
import type { AttrValue, VariantAttributeDef } from '@/lib/variant-attributes'

// Værdier redigeres som tekst: én værdi pr. linje, synonymer efter "=", fx "Marineblå = navy, marine"
const toText = (values: AttrValue[]) =>
  values.map(v => v.synonyms.length ? `${v.value} = ${v.synonyms.join(', ')}` : v.value).join('\n')
const fromText = (text: string): AttrValue[] =>
  text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [value, syn = ''] = l.split('=')
    return { value: value.trim(), synonyms: syn.split(',').map(s => s.trim()).filter(Boolean) }
  }).filter(v => v.value)

type Draft = { id?: string; name: string; unit: string; valuesText: string }
const empty: Draft = { name: '', unit: '', valuesText: '' }

const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function VariantAttributesTab() {
  const [rows, setRows]       = useState<VariantAttributeDef[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [draft, setDraft]     = useState<Draft | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/variant-attributes')
    const j = await res.json().catch(() => ({}))
    setRows(j.data ?? [])
    setMissing(!!j.migration_missing)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!draft) return
    setSaving(true); setError(null)
    const body = { name: draft.name, unit: draft.unit, values: fromText(draft.valuesText) }
    const res = await fetch(draft.id ? `/api/variant-attributes/${draft.id}` : '/api/variant-attributes', {
      method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error ?? 'Kunne ikke gemme'); return }
    setDraft(null)
    load()
  }

  async function remove(row: VariantAttributeDef) {
    if (!confirm(`Slet egenskaben "${row.name}"? Varianter, der allerede har den, beholder deres værdier.`)) return
    await fetch(`/api/variant-attributes/${row.id}`, { method: 'DELETE' })
    load()
  }

  // Byt plads med naboen og gem rækkefølgen for hele listen
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
    await Promise.all(next.map((r, k) => fetch(`/api/variant-attributes/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: k + 1 }),
    })))
  }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      {missing && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2">
          Kør migration <span className="font-mono">065_variant_attributes.sql</span> i Supabase for at bruge fælles variant-egenskaber.
        </p>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800 space-y-1">
        <p><strong>Hvad er det?</strong> Den fælles liste over, hvad der kan adskille varianter af samme vare — fx Størrelse, Farve eller Længde.</p>
        <p>Bruges når du samler varer som varianter (Saml ens varer): egenskaberne foreslås, og synonymer oversættes, så &quot;navy&quot; og &quot;marine&quot; begge bliver til &quot;Marineblå&quot;. Rækkefølgen af værdierne er den rækkefølge, kunden ser dem i.</p>
      </div>

      {!draft && !missing && (
        <button onClick={() => { setDraft(empty); setError(null) }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">+ Ny egenskab</button>
      )}

      {draft && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">{draft.id ? `Rediger "${draft.name}"` : 'Ny egenskab'}</h2>
          <div className="grid sm:grid-cols-[1fr_10rem] gap-3">
            <label className="text-xs font-semibold text-gray-700 space-y-1">
              <span>Navn *</span>
              <input className={inputCls} value={draft.name} placeholder="fx Størrelse, Farve, Længde"
                onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-700 space-y-1">
              <span>Enhed <span className="font-normal text-gray-400">(kun tal)</span></span>
              <input className={inputCls} value={draft.unit} placeholder="fx mm, m, l"
                onChange={e => setDraft({ ...draft, unit: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-gray-700 space-y-1">
            <span>Værdier <span className="font-normal text-gray-400">— én pr. linje i den rækkefølge kunden skal se dem. Synonymer efter &quot;=&quot;, adskilt af komma</span></span>
            <textarea className={`${inputCls} font-mono min-h-48`} value={draft.valuesText}
              placeholder={'S = small\nM = medium\nL = large\n\nMarineblå = navy, marine, mørkeblå'}
              onChange={e => setDraft({ ...draft, valuesText: e.target.value })} />
          </label>
          <p className="text-xs text-gray-500">
            Lad værdierne være tomme for tal-egenskaber med enhed (fx Længde i m) — så genkendes alle tal med den enhed.
          </p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !draft.name.trim()}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40">
              {saving ? 'Gemmer…' : 'Gem'}
            </button>
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuller</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Henter…</p> : (
        <div className="space-y-2">
          {rows.length === 0 && !missing && <p className="text-sm text-gray-400">Ingen egenskaber endnu.</p>}
          {rows.map((r, i) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <div className="flex flex-col text-gray-400 leading-none">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-gray-800 disabled:opacity-20" title="Flyt op">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="hover:text-gray-800 disabled:opacity-20" title="Flyt ned">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {r.name}{r.unit && <span className="ml-1.5 font-normal text-gray-500">({r.unit})</span>}
                </p>
                {r.values.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.values.map(v => (
                      <span key={v.value} className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5"
                        title={v.synonyms.length ? `Også: ${v.synonyms.join(', ')}` : undefined}>
                        {v.value}{v.synonyms.length > 0 && <span className="text-gray-400"> +{v.synonyms.length}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">{r.unit ? `Alle tal med enheden ${r.unit}` : 'Fri tekst'}</p>
                )}
              </div>
              <div className="flex gap-2 text-sm shrink-0">
                <button className="text-blue-600 hover:underline"
                  onClick={() => { setDraft({ id: r.id, name: r.name, unit: r.unit ?? '', valuesText: toText(r.values) }); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                  Rediger
                </button>
                <button className="text-red-600 hover:underline" onClick={() => remove(r)}>Slet</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
