'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BoatNavigator, type BoatHotspot } from './_BoatNavigator'

type BoatType = 'sailboat' | 'motorboat'

const COLORS = [
  '#1d4ed8', '#0891b2', '#7c3aed', '#dc2626',
  '#b45309', '#059669', '#0284c7', '#92400e',
  '#be185d', '#065f46',
]

const LABEL_SIDES = [
  { value: 'left',   label: '← Venstre' },
  { value: 'right',  label: '→ Højre'   },
  { value: 'top',    label: '↑ Op'      },
  { value: 'bottom', label: '↓ Ned'     },
]

const EMPTY_FORM = {
  label:         '',
  category_slug: '',
  description:   '',
  label_side:    'right' as const,
  color:         '#1d4ed8',
  sort_order:    0,
  is_active:     true,
  x_pct:         50,
  y_pct:         50,
}

export default function NavigationPage() {
  const [tab,        setTab]       = useState<BoatType>('sailboat')
  const [hotspots,   setHotspots]  = useState<BoatHotspot[]>([])
  const [loading,    setLoading]   = useState(true)
  const [selected,   setSelected]  = useState<string | null>(null)    // hotspot id being edited
  const [form,       setForm]      = useState({ ...EMPTY_FORM })
  const [saving,     setSaving]    = useState(false)
  const [mode,       setMode]      = useState<'preview' | 'edit'>('edit')
  const [placing,    setPlacing]   = useState(false)   // click-to-place mode
  const [dragging,   setDragging]  = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const SVG_W = 496
  const SVG_H = 320

  const fetchHotspots = useCallback(async () => {
    setLoading(true)
    const res  = await fetch(`/api/navigation?boat_type=${tab}&all=1`)
    const json = await res.json()
    setHotspots(json.data ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => {
    fetchHotspots()
    setSelected(null)
    setPlacing(false)
  }, [fetchHotspots])

  // ── SVG position helpers ────────────────────────────────────────────────────
  function svgCoords(e: React.MouseEvent | MouseEvent): { x: number; y: number } | null {
    if (!svgRef.current) return null
    const rect   = svgRef.current.getBoundingClientRect()
    const scaleX = SVG_W / rect.width
    const scaleY = SVG_H / rect.height
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) * scaleX / SVG_W * 100))),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top)  * scaleY / SVG_H * 100))),
    }
  }

  // ── Click on SVG background → place new hotspot ─────────────────────────────
  function handleSVGClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!placing) return
    const pos = svgCoords(e)
    if (!pos) return
    setForm(f => ({ ...f, x_pct: parseFloat(pos.x.toFixed(2)), y_pct: parseFloat(pos.y.toFixed(2)) }))
    setSelected(null)   // new hotspot form
    setPlacing(false)
  }

  // ── Click on existing hotspot dot → select it ──────────────────────────────
  function selectHotspot(h: BoatHotspot, e: React.MouseEvent) {
    e.stopPropagation()
    if (dragging) return
    setSelected(h.id)
    setForm({
      label:         h.label,
      category_slug: h.category_slug,
      description:   h.description ?? '',
      label_side:    h.label_side as typeof EMPTY_FORM.label_side,
      color:         h.color,
      sort_order:    h.sort_order,
      is_active:     h.is_active,
      x_pct:         h.x_pct,
      y_pct:         h.y_pct,
    })
  }

  // ── Drag hotspot to reposition ──────────────────────────────────────────────
  function startDrag(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDragging(id)
    setSelected(id)
    const h = hotspots.find(h => h.id === id)
    if (h) setForm(f => ({ ...f, x_pct: h.x_pct, y_pct: h.y_pct }))

    const onMove = (me: MouseEvent) => {
      const pos = svgCoords(me)
      if (!pos) return
      const xp = parseFloat(pos.x.toFixed(2))
      const yp = parseFloat(pos.y.toFixed(2))
      setHotspots(hs => hs.map(h => h.id === id ? { ...h, x_pct: xp, y_pct: yp } : h))
      setForm(f => ({ ...f, x_pct: xp, y_pct: yp }))
    }
    const onUp = async (me: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      const pos = svgCoords(me)
      if (pos) {
        const xp = parseFloat(pos.x.toFixed(2))
        const yp = parseFloat(pos.y.toFixed(2))
        await fetch(`/api/navigation?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x_pct: xp, y_pct: yp }),
        })
      }
      setDragging(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  // ── Save / create hotspot ───────────────────────────────────────────────────
  async function save() {
    if (!form.label.trim() || !form.category_slug.trim()) return
    setSaving(true)
    if (selected) {
      // Update existing
      await fetch(`/api/navigation?id=${selected}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      // Create new
      await fetch('/api/navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, boat_type: tab }),
      })
    }
    setSaving(false)
    setSelected(null)
    setForm({ ...EMPTY_FORM })
    fetchHotspots()
  }

  async function deleteHotspot(id: string) {
    if (!confirm('Slet dette hotspot?')) return
    await fetch(`/api/navigation?id=${id}`, { method: 'DELETE' })
    setSelected(null)
    fetchHotspots()
  }

  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/navigation?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    fetchHotspots()
  }

  const activeHotspots   = hotspots.filter(h => h.is_active)
  const inactiveHotspots = hotspots.filter(h => !h.is_active)
  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: SVG editor + tabs ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <div className="border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between shrink-0 gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Båd-navigation</h2>
            <p className="text-xs text-gray-500">Visuelt kategori-kort til lovesaling.dk</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Boat type toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['sailboat', 'motorboat'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {t === 'sailboat' ? '⛵ Sejlbåd' : '🚤 Motorbåd'}
                </button>
              ))}
            </div>

            {/* Edit / Preview toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['edit', 'preview'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {m === 'edit' ? '✏️ Rediger' : '👁 Forhåndsvisning'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 overflow-auto p-5">

          {mode === 'preview' ? (
            // ── Preview mode ────────────────────────────────────────────────
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <BoatNavigator
                  boatType={tab}
                  hotspots={activeHotspots}
                  baseCategoryUrl="/kategori"
                  showTitle
                />
              </div>
              <p className="text-xs text-center text-gray-400 mt-3">
                Sådan ser det ud på lovesaling.dk — kun aktive hotspots vises
              </p>
            </div>
          ) : (
            // ── Edit mode ───────────────────────────────────────────────────
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {placing
                    ? '🎯 Klik på båden for at placere hotspot'
                    : 'Klik på en prik for at redigere · Træk for at flytte'
                  }
                </p>
                <button
                  onClick={() => { setPlacing(p => !p); setSelected(null); setForm({ ...EMPTY_FORM }) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    placing
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600'
                  }`}>
                  {placing ? '× Annuller placering' : '+ Nyt hotspot (klik på båden)'}
                </button>
              </div>

              {/* SVG editor */}
              <div className={`relative bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border-2 overflow-hidden transition-colors ${
                placing ? 'border-blue-400 border-dashed cursor-crosshair' : 'border-gray-200 cursor-default'
              }`}>
                <svg
                  ref={svgRef}
                  viewBox="0 0 496 320"
                  className="w-full"
                  onClick={handleSVGClick}
                  style={{ display: 'block', userSelect: 'none' }}
                >
                  {/* Boat */}
                  {tab === 'sailboat' ? (
                    <g>
                      <ellipse cx="248" cy="298" rx="195" ry="8" fill="rgba(14,116,144,0.08)" />
                      <path d="M 58 238 Q 155 256 248 258 Q 341 256 438 238 L 425 272 Q 340 288 248 290 Q 156 288 71 272 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
                      <path d="M 68 245 Q 248 263 428 245" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
                      <path d="M 238 272 L 230 312 L 266 312 L 258 272 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
                      <path d="M 175 238 L 175 220 Q 220 212 248 212 Q 276 212 322 220 L 322 238 Z" fill="#dde6f0" stroke="#94a3b8" strokeWidth="1.5" />
                      <line x1="248" y1="42" x2="248" y2="240" stroke="#64748b" strokeWidth="3.5" strokeLinecap="round" />
                      <line x1="248" y1="48" x2="118" y2="238" stroke="#94a3b8" strokeWidth="1" />
                      <line x1="248" y1="48" x2="388" y2="238" stroke="#94a3b8" strokeWidth="1" />
                      <line x1="248" y1="205" x2="375" y2="228" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
                      <path d="M 248 50 L 248 210 L 372 226 Z" fill="rgba(219,234,254,0.85)" stroke="#93c5fd" strokeWidth="1.5" />
                      <path d="M 248 78 L 248 238 L 125 233 Z" fill="rgba(219,234,254,0.7)" stroke="#93c5fd" strokeWidth="1.5" />
                      <line x1="248" y1="128" x2="215" y2="145" stroke="#94a3b8" strokeWidth="1.5" />
                      <line x1="248" y1="128" x2="281" y2="145" stroke="#94a3b8" strokeWidth="1.5" />
                      <path d="M 210 238 Q 248 242 286 238 L 282 253 Q 248 256 214 253 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
                    </g>
                  ) : (
                    <g>
                      <ellipse cx="248" cy="298" rx="210" ry="8" fill="rgba(14,116,144,0.08)" />
                      <path d="M 38 225 Q 155 248 248 250 Q 341 248 458 222 L 445 260 Q 340 278 248 280 Q 156 278 52 262 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
                      <path d="M 46 232 Q 248 255 450 229" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
                      <path d="M 38 225 Q 55 205 80 200 L 95 225 Z" fill="#dde6f0" stroke="#94a3b8" strokeWidth="1.5" />
                      <path d="M 88 200 Q 248 210 445 218 L 445 225 Q 248 230 80 222 Z" fill="#dde6f0" stroke="#94a3b8" strokeWidth="1" />
                      <path d="M 110 165 L 110 202 L 365 210 L 365 168 L 325 140 L 155 138 Z" fill="#e8f0f8" stroke="#94a3b8" strokeWidth="2" />
                      <path d="M 155 138 L 325 140 L 365 168 L 110 165 Z" fill="rgba(186,230,253,0.55)" stroke="#7dd3fc" strokeWidth="1.5" />
                      <rect x="122" y="168" width="52" height="32" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />
                      <rect x="188" y="165" width="58" height="35" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />
                      <rect x="262" y="165" width="52" height="33" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />
                      <path d="M 330 205 Q 360 170 390 205" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
                      <line x1="330" y1="205" x2="330" y2="215" stroke="#94a3b8" strokeWidth="2" />
                      <line x1="390" y1="205" x2="390" y2="220" stroke="#94a3b8" strokeWidth="2" />
                      <ellipse cx="360" cy="168" rx="16" ry="10" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                      <rect x="420" y="234" width="32" height="22" rx="4" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
                    </g>
                  )}

                  {/* Hotspot dots in editor */}
                  {hotspots.map(h => {
                    const cx  = h.x_pct / 100 * 496
                    const cy  = h.y_pct / 100 * 320
                    const sel = selected === h.id
                    return (
                      <g key={h.id}
                        style={{ cursor: 'grab' }}
                        onClick={e => selectHotspot(h, e)}
                        onMouseDown={e => startDrag(h.id, e)}>
                        {/* Pulse */}
                        <circle cx={cx} cy={cy} r={sel ? 16 : 12} fill={h.color} opacity={sel ? 0.2 : 0.1} />
                        {/* Ring */}
                        <circle cx={cx} cy={cy} r={sel ? 9 : 7} fill="white" stroke={h.color}
                          strokeWidth={sel ? 2.5 : 2}
                          opacity={h.is_active ? 1 : 0.4} />
                        {/* Dot */}
                        <circle cx={cx} cy={cy} r={sel ? 5 : 3.5} fill={h.color}
                          opacity={h.is_active ? 1 : 0.4} />
                        {/* Label tooltip */}
                        {sel && (
                          <text x={cx} y={cy - 14} textAnchor="middle"
                            fontSize="9" fill={h.color} fontWeight="600">
                            {h.label}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* "Klik her" hint when placing */}
                  {placing && (
                    <text x={248} y={16} textAnchor="middle" fontSize="11" fill="#3b82f6" opacity="0.7">
                      Klik på båden for at placere
                    </text>
                  )}
                </svg>
              </div>

              {/* Hotspot list */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {hotspots.map(h => (
                  <div key={h.id}
                    onClick={() => { selectHotspot(h, { stopPropagation: () => {} } as React.MouseEvent) }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      selected === h.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${!h.is_active ? 'opacity-50' : ''}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: h.color }} />
                    <span className="text-xs font-medium text-gray-800 flex-1 truncate">{h.label}</span>
                    <button onClick={e => { e.stopPropagation(); toggleActive(h.id, !h.is_active) }}
                      title={h.is_active ? 'Deaktivér' : 'Aktivér'}
                      className="text-gray-300 hover:text-gray-600 text-xs shrink-0">
                      {h.is_active ? '●' : '○'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteHotspot(h.id) }}
                      className="text-gray-200 hover:text-red-400 text-sm shrink-0">×</button>
                  </div>
                ))}
                {loading && <p className="text-xs text-gray-400 col-span-2 text-center py-4">Henter hotspots...</p>}
                {!loading && hotspots.length === 0 && (
                  <p className="text-xs text-gray-400 col-span-2 text-center py-4">
                    Ingen hotspots endnu — klik "+ Nyt hotspot" og klik på båden
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Edit form ────────────────────────────────────────────────── */}
      {mode === 'edit' && (
        <div className="w-72 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">
              {selected ? 'Rediger hotspot' : 'Nyt hotspot'}
            </h3>
            {selected && (
              <p className="text-xs text-gray-400 mt-0.5">
                Træk prikken på tegningen for at flytte
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label <span className="text-red-400">*</span></label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className={inputCls} placeholder="Anker & Fortøjning" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kategori-slug <span className="text-red-400">*</span></label>
              <input value={form.category_slug} onChange={e => setForm(f => ({ ...f, category_slug: e.target.value }))}
                className={inputCls + ' font-mono text-xs'} placeholder="anker-fortojning" />
              <p className="text-[10px] text-gray-400 mt-0.5">URL: /kategori/<em>{form.category_slug || '…'}</em></p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Undertekst</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className={inputCls + ' resize-none text-xs'}
                placeholder="Kort beskrivelse i label-kortet" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label-side</label>
              <div className="grid grid-cols-2 gap-1.5">
                {LABEL_SIDES.map(s => (
                  <button key={s.value} onClick={() => setForm(f => ({ ...f, label_side: s.value as typeof form.label_side }))}
                    className={`px-2 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      form.label_side === s.value
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Farve</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.color === c ? 'border-gray-800 scale-110' : 'border-white shadow-sm'
                    }`}
                    style={{ background: c }} />
                ))}
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="w-7 h-7 rounded-full cursor-pointer border border-gray-200 p-0.5"
                  title="Vælg brugerdefineret farve" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">X position (%)</label>
                <input type="number" min="0" max="100" step="0.5"
                  value={form.x_pct}
                  onChange={e => setForm(f => ({ ...f, x_pct: parseFloat(e.target.value) }))}
                  className={inputCls + ' font-mono text-xs'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Y position (%)</label>
                <input type="number" min="0" max="100" step="0.5"
                  value={form.y_pct}
                  onChange={e => setForm(f => ({ ...f, y_pct: parseFloat(e.target.value) }))}
                  className={inputCls + ' font-mono text-xs'} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sorteringsorden</label>
              <input type="number" value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) }))}
                className={inputCls + ' font-mono text-xs'} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 accent-blue-600" />
              <span className="text-sm text-gray-700 font-medium">Aktiv (synlig på siden)</span>
            </label>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 space-y-2">
            <button onClick={save} disabled={saving || !form.label.trim() || !form.category_slug.trim()}
              className="w-full py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
              {saving ? 'Gemmer...' : selected ? 'Gem ændringer' : 'Opret hotspot'}
            </button>
            {selected && (
              <button onClick={() => { setSelected(null); setForm({ ...EMPTY_FORM }) }}
                className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                + Opret nyt hotspot i stedet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
