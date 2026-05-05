'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AiSuggestion } from '@/app/api/product-types/suggest/route'

type VariantAttribute = { name: string; unit: string }

type ProductTypeRow = {
  id: string
  name: string
  keywords: string[]
  variant_attributes: VariantAttribute[]
  our_category: string | null
  our_subcategory: string | null
  notes: string | null
  active: boolean
}

type FormState = {
  name: string
  keywords: string
  our_category: string
  our_subcategory: string
  notes: string
  variant_attributes: VariantAttribute[]
}

const emptyForm = (): FormState => ({
  name: '', keywords: '', our_category: '', our_subcategory: '', notes: '',
  variant_attributes: [],
})

function formFromRow(row: ProductTypeRow): FormState {
  return {
    name:               row.name,
    keywords:           row.keywords.join(', '),
    our_category:       row.our_category ?? '',
    our_subcategory:    row.our_subcategory ?? '',
    notes:              row.notes ?? '',
    variant_attributes: row.variant_attributes.map(a => ({ ...a })),
  }
}

// ─── Help text component ───────────────────────────────────────
function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 mt-1 leading-relaxed">{children}</p>
}

// ─── Form ─────────────────────────────────────────────────────
function ProductTypeForm({
  initial, onSave, onCancel, saving,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }
  function addAttr() {
    setForm(f => ({ ...f, variant_attributes: [...f.variant_attributes, { name: '', unit: '' }] }))
  }
  function removeAttr(i: number) {
    setForm(f => ({ ...f, variant_attributes: f.variant_attributes.filter((_, j) => j !== i) }))
  }
  function setAttr(i: number, key: 'name' | 'unit', value: string) {
    setForm(f => {
      const attrs = [...f.variant_attributes]
      attrs[i] = { ...attrs[i], [key]: value }
      return { ...f, variant_attributes: attrs }
    })
  }

  const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-5">

      {/* Eksempel-boks */}
      <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-xs text-blue-800 space-y-1">
        <p className="font-medium">Eksempel — Ankerkæde:</p>
        <p>Navn: <span className="font-mono">Ankerkæde</span> · Nøgleord: <span className="font-mono">ankerkæde, kæde</span> · Kategori: <span className="font-mono">Ankre & fortøjning</span></p>
        <p>Variant-egenskaber: <span className="font-mono">Godstyklelse (mm)</span> og <span className="font-mono">Længde (m)</span></p>
        <p className="text-blue-600">→ "Ankerkæde galvaniseret 10mm 30m" og "Ankerkæde galvaniseret 10mm 50m" bliver varianter af samme produkt.</p>
      </div>

      {/* Navn */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Produkttype-navn *</label>
        <input type="text" value={form.name} onChange={e => setField('name', e.target.value)}
          placeholder="fx Ankerkæde, Fender, Fortøjningstov" className={inputCls} />
        <FieldHelp>Det interne navn for denne type — bruges til overblik og til at navngive masterproduktet.</FieldHelp>
      </div>

      {/* Nøgleord */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Nøgleord (kommasepareret) *</label>
        <input type="text" value={form.keywords} onChange={e => setField('keywords', e.target.value)}
          placeholder="ankerkæde, kæde, anchor chain" className={inputCls} />
        <FieldHelp>
          Hvis et produktnavn indeholder ét af disse ord, kobles det til denne produkttype.
          Søgningen er case-insensitiv og matcher delstrenge — skriv gerne både dansk, engelsk og forkortelser.
          Eksempel: <span className="font-mono text-gray-500">ankerkæde, kæde, chain</span>
        </FieldHelp>
      </div>

      {/* Kategorier */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Vores kategori</label>
          <input type="text" value={form.our_category} onChange={e => setField('our_category', e.target.value)}
            placeholder="Ankre & fortøjning" className={inputCls} />
          <FieldHelp>Overordnet kategori i webshop — vises for kunden. Bruges på tværs af alle leverandørers produkter af denne type.</FieldHelp>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Underkategori</label>
          <input type="text" value={form.our_subcategory} onChange={e => setField('our_subcategory', e.target.value)}
            placeholder="Ankerkæder" className={inputCls} />
          <FieldHelp>Mere specifik underkategori (valgfri). Eksempel: Ankre & fortøjning › <span className="font-mono">Ankerkæder</span></FieldHelp>
        </div>
      </div>

      {/* Variant-egenskaber */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-gray-700">Variant-egenskaber</label>
          <button type="button" onClick={addAttr} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            + Tilføj egenskab
          </button>
        </div>
        <FieldHelp>
          Definer hvilke målenheder i produktnavnet der angiver en <strong>variant</strong> — altså noget kunden vælger — frem for et separat produkt.
          Regel: Hvis en 10mm og en 12mm kæde begge er nyttige for samme kunde og typisk lagerføres sammen → variant.
          Hvis de henvender sig til helt forskellige behov → separate produkter.
        </FieldHelp>
        <div className="mt-2 space-y-2">
          {form.variant_attributes.length === 0 && (
            <p className="text-xs text-gray-400 italic bg-gray-50 rounded px-3 py-2">
              Ingen variant-egenskaber — produktet oprettes som simpelt produkt uden varianter.
              Tilføj egenskaber hvis produktet fås i forskellige størrelser, længder eller andre variationer.
            </p>
          )}
          {form.variant_attributes.map((attr, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="flex-1">
                {i === 0 && <p className="text-xs text-gray-400 mb-1">Egenskabsnavn (vises i Woo)</p>}
                <input type="text" value={attr.name} onChange={e => setAttr(i, 'name', e.target.value)}
                  placeholder="fx Godstyklelse, Længde, Bredde"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="w-28">
                {i === 0 && <p className="text-xs text-gray-400 mb-1">Enhed i navn</p>}
                <input type="text" value={attr.unit} onChange={e => setAttr(i, 'unit', e.target.value)}
                  placeholder="mm / m / l"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className={i === 0 ? 'mt-5' : ''}>
                <button type="button" onClick={() => removeAttr(i)} className="text-red-400 hover:text-red-600 text-lg px-2">×</button>
              </div>
            </div>
          ))}
        </div>
        {form.variant_attributes.length > 0 && (
          <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded px-3 py-1.5">
            Systemet søger efter mønsteret <span className="font-mono">[tal][enhed]</span> i produktnavnet — fx <span className="font-mono">10mm</span>, <span className="font-mono">30m</span>, <span className="font-mono">25 l</span> — og bruger det til at gruppere varianter.
          </p>
        )}
      </div>

      {/* Noter */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Noter (valgfrit)</label>
        <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
          placeholder="Evt. særlige regler eller undtagelser for denne produkttype..."
          className={inputCls} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.keywords.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Gemmer…' : 'Gem produkttype'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">
          Annuller
        </button>
      </div>
    </div>
  )
}

// ─── AI Suggestion card ────────────────────────────────────────
function SuggestionCard({
  s, onAccept, onDismiss, accepting,
}: {
  s: AiSuggestion
  onAccept: (s: AiSuggestion) => void
  onDismiss: () => void
  accepting: boolean
}) {
  return (
    <div className="bg-white border border-purple-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
            {s.our_category && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                {s.our_category}{s.our_subcategory ? ` › ${s.our_subcategory}` : ''}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {s.keywords.map(kw => (
              <span key={kw} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kw}</span>
            ))}
          </div>

          {s.variant_attributes.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-gray-400">Varianter:</span>
              {s.variant_attributes.map((a, i) => (
                <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                  {a.name} ({a.unit})
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 italic">{s.reasoning}</p>

          {s.example_names.length > 0 && (
            <div className="text-xs text-gray-400">
              Eksempler: {s.example_names.map((e, i) => (
                <span key={i} className="font-mono">{e}{i < s.example_names.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => onAccept(s)} disabled={accepting}
            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
            {accepting ? 'Gemmer…' : '✓ Tilføj'}
          </button>
          <button onClick={onDismiss}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs rounded-md hover:bg-gray-50">
            Afvis
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────
export default function ProductTypesPage() {
  const [rows,        setRows]        = useState<ProductTypeRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [showNew,     setShowNew]     = useState(false)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  // AI suggestions
  const [aiRunning,     setAiRunning]     = useState(false)
  const [aiError,       setAiError]       = useState<string | null>(null)
  const [suggestions,   setSuggestions]   = useState<AiSuggestion[]>([])
  const [dismissedIdxs, setDismissedIdxs] = useState<Set<number>>(new Set())
  const [sampleSize,    setSampleSize]    = useState<number>(0)

  // Full auto-run
  const [fullRunning, setFullRunning] = useState(false)
  const [fullLog,     setFullLog]     = useState<{ round: number; added: number; msg?: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/product-types')
      if (!res.ok) throw new Error(await res.text())
      setRows(await res.json())
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(form: FormState) {
    setSaving(true)
    try {
      const res = await fetch('/api/product-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name.trim(),
          keywords:           form.keywords.split(',').map(s => s.trim()).filter(Boolean),
          variant_attributes: form.variant_attributes.filter(a => a.name.trim() && a.unit.trim()),
          our_category:       form.our_category.trim() || null,
          our_subcategory:    form.our_subcategory.trim() || null,
          notes:              form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setShowNew(false); await load()
    } catch (e) { alert(`Fejl: ${String(e)}`) }
    finally { setSaving(false) }
  }

  async function handleUpdate(id: string, form: FormState) {
    setSaving(true)
    try {
      const res = await fetch(`/api/product-types/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name.trim(),
          keywords:           form.keywords.split(',').map(s => s.trim()).filter(Boolean),
          variant_attributes: form.variant_attributes.filter(a => a.name.trim() && a.unit.trim()),
          our_category:       form.our_category.trim() || null,
          our_subcategory:    form.our_subcategory.trim() || null,
          notes:              form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setEditId(null); await load()
    } catch (e) { alert(`Fejl: ${String(e)}`) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/product-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setDeleteId(null); await load()
    } catch (e) { alert(`Fejl: ${String(e)}`) }
    finally { setSaving(false) }
  }

  async function fetchSuggestions(): Promise<{ suggestions: AiSuggestion[]; sample_size: number; message?: string } | null> {
    const res  = await fetch('/api/product-types/suggest', { method: 'POST' })
    const text = await res.text()
    let json: Record<string, unknown>
    try { json = JSON.parse(text) }
    catch { throw new Error(res.ok ? `Ugyldigt svar fra server: ${text.slice(0, 120)}` : `Server fejl ${res.status}: ${text.slice(0, 120)}`) }
    if (!res.ok) throw new Error((json.error as string) ?? `Server fejl ${res.status}`)
    return json as { suggestions: AiSuggestion[]; sample_size: number; message?: string }
  }

  async function runAiAnalysis() {
    setAiRunning(true); setAiError(null); setSuggestions([]); setDismissedIdxs(new Set())
    try {
      const json = await fetchSuggestions()
      if (!json) return
      if (json.message) { setAiError('ℹ️ ' + json.message); return }
      setSuggestions(json.suggestions ?? [])
      setSampleSize(json.sample_size ?? 0)
    } catch (e) { setAiError(String(e)) }
    finally { setAiRunning(false) }
  }

  async function runFullAnalysis() {
    setFullRunning(true); setAiError(null); setFullLog([])
    const MAX_ROUNDS = 15
    let totalAdded = 0

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      setFullLog(prev => [...prev, { round, added: 0, msg: `Runde ${round} — analyserer…` }])

      let suggestions: AiSuggestion[] = []
      let allCovered = false
      try {
        const json   = await fetchSuggestions()
        suggestions  = json?.suggestions ?? []
        allCovered   = !!(json?.message && suggestions.length === 0)
      } catch (e) {
        // JSON parse / network / timeout error — log and retry next round
        setFullLog(prev => prev.map((l, i) => i === prev.length - 1
          ? { ...l, msg: `Runde ${round} — forbigået (${String(e).slice(0, 100)})` }
          : l
        ))
        continue
      }

      if (allCovered || suggestions.length === 0) {
        setFullLog(prev => prev.map((l, i) => i === prev.length - 1 ? { ...l, added: 0, msg: `Runde ${round} — alle produkter er nu dækket af en produkttype 🎉` } : l))
        break
      }

      // Auto-save all suggestions
      let added = 0
      for (const s of suggestions) {
        try {
          const res = await fetch('/api/product-types', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name:               s.name,
              keywords:           s.keywords,
              variant_attributes: s.variant_attributes,
              our_category:       s.our_category || null,
              our_subcategory:    s.our_subcategory || null,
              notes:              s.reasoning || null,
            }),
          })
          if (res.ok) added++
        } catch { /* skip duplicates */ }
      }

      totalAdded += added
      setFullLog(prev => prev.map((l, i) => i === prev.length - 1
        ? { ...l, added, msg: `Runde ${round} — ${added} produkttyper tilføjet (${suggestions.length} forslag)` }
        : l
      ))
      await load()

      if (added === 0) {
        setFullLog(prev => [...prev, { round: round + 1, added: 0, msg: `Ingen nye typer i runde ${round} — analyse færdig! I alt ${totalAdded} produkttyper tilføjet.` }])
        break
      }

      if (round === MAX_ROUNDS) {
        setFullLog(prev => [...prev, { round: round + 1, added: 0, msg: `Maks ${MAX_ROUNDS} runder nået. I alt ${totalAdded} produkttyper tilføjet.` }])
      }
    }

    setFullRunning(false)
  }

  async function acceptSuggestion(s: AiSuggestion, idx: number) {
    setAcceptingId(String(idx))
    try {
      const res = await fetch('/api/product-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               s.name,
          keywords:           s.keywords,
          variant_attributes: s.variant_attributes,
          our_category:       s.our_category || null,
          our_subcategory:    s.our_subcategory || null,
          notes:              s.reasoning || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Fejl')
      setDismissedIdxs(prev => new Set([...prev, idx]))
      await load()
    } catch (e) { alert(`Fejl: ${String(e)}`) }
    finally { setAcceptingId(null) }
  }

  const rowToDelete = rows.find(r => r.id === deleteId)
  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIdxs.has(i))

  // ── Category navigation state ──
  const [selectedCat,    setSelectedCat]    = useState<string | null>(null)
  const [selectedSub,    setSelectedSub]    = useState<string | null>(null)

  // Build category tree from rows
  const NO_CAT = '(Ingen kategori)'
  const NO_SUB = '(Ingen underkategori)'

  const catTree = (() => {
    const tree = new Map<string, Map<string, ProductTypeRow[]>>()
    for (const row of rows) {
      const cat = row.our_category || NO_CAT
      const sub = row.our_subcategory || NO_SUB
      if (!tree.has(cat)) tree.set(cat, new Map())
      if (!tree.get(cat)!.has(sub)) tree.get(cat)!.set(sub, [])
      tree.get(cat)!.get(sub)!.push(row)
    }
    return tree
  })()

  const categories   = Array.from(catTree.keys()).sort((a, b) => a === NO_CAT ? 1 : b === NO_CAT ? -1 : a.localeCompare(b, 'da'))
  const subcategories = selectedCat ? Array.from(catTree.get(selectedCat)?.keys() ?? []).sort((a, b) => a === NO_SUB ? 1 : b === NO_SUB ? -1 : a.localeCompare(b, 'da')) : []
  const visibleRows   = selectedCat && selectedSub
    ? (catTree.get(selectedCat)?.get(selectedSub) ?? [])
    : selectedCat
      ? Array.from(catTree.get(selectedCat)?.values() ?? []).flat()
      : []

  function selectCat(cat: string) {
    setSelectedCat(cat)
    setSelectedSub(null)
    setEditId(null)
    setShowNew(false)
  }
  function selectSub(sub: string) {
    setSelectedSub(sub === selectedSub ? null : sub)
    setEditId(null)
    setShowNew(false)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Produkttyper</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Definer regler for produkttyper — nøgleord der identificerer typen, variant-egenskaber (fx størrelse og længde),
            og vores egen kategori til webshop. Bruges automatisk ved produktoprettelse fra leverandørdata.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={runAiAnalysis} disabled={aiRunning || fullRunning}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            {aiRunning
              ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyserer…</>
              : '✨ Analyser leverandørprodukter'}
          </button>
          <button onClick={runFullAnalysis} disabled={aiRunning || fullRunning}
            title="Kører analyse i flere runder og gemmer automatisk alle forslag, indtil der ikke kommer nye produkttyper"
            className="px-4 py-2 bg-purple-800 text-white text-sm rounded-md hover:bg-purple-900 disabled:opacity-50 flex items-center gap-2">
            {fullRunning
              ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Kører fuld analyse…</>
              : '⚡ Kør fuld analyse'}
          </button>
          {!showNew && (
            <button onClick={() => { setShowNew(true); setEditId(null) }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              + Ny produkttype
            </button>
          )}
        </div>
      </div>

      {/* Full analysis log */}
      {fullLog.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 space-y-1">
          <div className="text-xs font-semibold text-purple-700 mb-2">⚡ Fuld analyse — fremgang</div>
          {fullLog.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-purple-800">
              {fullRunning && i === fullLog.length - 1
                ? <span className="inline-block w-2.5 h-2.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
                : <span className="text-purple-400">✓</span>
              }
              <span>{l.msg}</span>
              {l.added > 0 && (
                <span className="ml-auto bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">+{l.added}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI error */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          ✗ {aiError}
        </div>
      )}

      {/* AI suggestions */}
      {visibleSuggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700">
              ✨ AI-forslag ({visibleSuggestions.length} tilbage)
            </h2>
            <span className="text-xs text-gray-400">
              Baseret på {sampleSize} produktnavne fra staging — gennemgå og tilføj dem der giver mening
            </span>
          </div>
          {suggestions.map((s, i) => dismissedIdxs.has(i) ? null : (
            <SuggestionCard
              key={i}
              s={s}
              onAccept={s2 => acceptSuggestion(s2, i)}
              onDismiss={() => setDismissedIdxs(prev => new Set([...prev, i]))}
              accepting={acceptingId === String(i)}
            />
          ))}
        </div>
      )}

      {/* New form */}
      {showNew && (
        <div className="bg-white border border-blue-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Ny produkttype</h2>
          <ProductTypeForm initial={emptyForm()} onSave={handleCreate}
            onCancel={() => setShowNew(false)} saving={saving} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && <div className="text-sm text-gray-400">Indlæser…</div>}

      {/* Empty state */}
      {!loading && rows.length === 0 && !showNew && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-500 text-sm mb-1">Ingen produkttyper endnu.</p>
          <p className="text-gray-400 text-xs mb-4">Brug AI-forslag til at komme hurtigt i gang, eller opret manuelt.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={runAiAnalysis} disabled={aiRunning}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50">
              ✨ Analyser leverandørprodukter
            </button>
            <button onClick={() => setShowNew(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              Opret manuelt
            </button>
          </div>
        </div>
      )}

      {/* ── Category browser ── */}
      {!loading && rows.length > 0 && (
        <div className="flex gap-4 items-start">

          {/* Category column */}
          <div className="w-56 shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Kategori
            </div>
            {categories.map(cat => {
              const count = Array.from(catTree.get(cat)?.values() ?? []).flat().length
              return (
                <button
                  key={cat}
                  onClick={() => selectCat(cat)}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 border-b border-gray-100 last:border-0 transition-colors ${
                    selectedCat === cat ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${selectedCat === cat ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Subcategory + product types columns */}
          {selectedCat && (
            <div className="flex gap-4 flex-1 min-w-0 items-start">

              {/* Subcategory column */}
              {subcategories.length > 1 && (
                <div className="w-48 shrink-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Underkategori
                  </div>
                  <button
                    onClick={() => setSelectedSub(null)}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 border-b border-gray-100 transition-colors ${
                      selectedSub === null ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span>Alle</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {Array.from(catTree.get(selectedCat)?.values() ?? []).flat().length}
                    </span>
                  </button>
                  {subcategories.map(sub => {
                    const count = catTree.get(selectedCat)?.get(sub)?.length ?? 0
                    return (
                      <button
                        key={sub}
                        onClick={() => selectSub(sub)}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 border-b border-gray-100 last:border-0 transition-colors ${
                          selectedSub === sub ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="truncate">{sub}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${selectedSub === sub ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Product types list */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 py-1">
                  {visibleRows.length} produkttype{visibleRows.length !== 1 ? 'r' : ''} — {selectedCat}{selectedSub && selectedSub !== NO_SUB ? ` › ${selectedSub}` : ''}
                </div>
                {visibleRows.sort((a, b) => a.name.localeCompare(b.name, 'da')).map(row => (
                  <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    {editId === row.id ? (
                      <>
                        <h3 className="text-sm font-semibold text-gray-800 mb-4">Rediger: {row.name}</h3>
                        <ProductTypeForm initial={formFromRow(row)} onSave={f => handleUpdate(row.id, f)}
                          onCancel={() => setEditId(null)} saving={saving} />
                      </>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm">{row.name}</span>
                            {!row.active && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inaktiv</span>
                            )}
                            {row.our_subcategory && (
                              <span className="text-xs text-gray-400">{row.our_subcategory}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {row.keywords.map(kw => (
                              <span key={kw} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kw}</span>
                            ))}
                          </div>
                          {row.variant_attributes.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-center">
                              <span className="text-xs text-gray-400">Varianter:</span>
                              {row.variant_attributes.map((a, i) => (
                                <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                                  {a.name} ({a.unit})
                                </span>
                              ))}
                            </div>
                          )}
                          {row.notes && <p className="text-xs text-gray-400 italic">{row.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => { setEditId(row.id); setShowNew(false) }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Rediger
                          </button>
                          <button onClick={() => setDeleteId(row.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium">
                            Slet
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No category selected yet */}
          {!selectedCat && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-16">
              ← Vælg en kategori for at se produkttyper
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && rowToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Slet produkttype?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Er du sikker på at du vil slette <span className="font-medium">{rowToDelete.name}</span>?
              Dette kan ikke fortrydes.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50">
                Annuller
              </button>
              <button onClick={() => handleDelete(deleteId)} disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Sletter…' : 'Slet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
