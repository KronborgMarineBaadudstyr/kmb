'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ──

type SupplierImage = {
  url:        string
  alt?:       string
  is_primary?: boolean
}

type MatchMember = {
  id:              string
  supplier_id:     string
  normalized_name: string
  normalized_ean:  string | null
  normalized_sku:  string
  raw_data:        Record<string, unknown>
  suppliers:       { name: string }
}

type MatchGroup = {
  id:               string
  status:           'pending_review' | 'confirmed' | 'rejected' | 'product_created'
  match_confidence: 'high' | 'medium' | 'low'
  match_method:     'ean' | 'fuzzy_name' | 'parent_sku' | 'variant' | 'manual' | 'single'
  supplier_count:   number
  suggested_name:   string | null
  suggested_ean:    string | null
  product_id:       string | null
  notes:            string | null
  created_at:       string
  members:          MatchMember[]
}

type Stats = {
  total:     number
  pending:   number
  high:      number
  medium:    number
  variant:   number
  single:    number
  confirmed: number
  rejected:  number
  created:   number
}

type ProgressEvent = {
  stage:           string
  message:         string
  groups_created?: number
  rows_assigned?:  number
  total?:          number
}

// ── Helpers ──

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: 'Høj (EAN)',  color: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: 'Middel',     color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:    { label: 'Lav',        color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review:  { label: 'Afventer',         color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  confirmed:       { label: 'Bekræftet',        color: 'bg-blue-50 text-blue-700 border-blue-200'       },
  rejected:        { label: 'Afvist',           color: 'bg-gray-100 text-gray-500 border-gray-200'      },
  product_created: { label: 'Produkt oprettet', color: 'bg-green-50 text-green-700 border-green-200'    },
}

function fmt(val: unknown, fallback = '—'): string {
  if (val == null) return fallback
  const s = String(val)
  return s || fallback
}

function fmtPrice(val: unknown): string {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n)) return '—'
  return `${n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
}

// ── Product detail slide-over ──
function MemberDetailPanel({
  member,
  onClose,
}: {
  member: MatchMember
  onClose: () => void
}) {
  const rd      = member.raw_data
  const images  = (rd.supplier_images as SupplierImage[] | undefined) ?? []
  const primary = images.find(i => i.is_primary) ?? images[0]
  const rest    = images.filter(i => i !== primary)

  // Fields to display (label, key or value)
  const fields: { label: string; value: unknown }[] = [
    { label: 'Leverandør',        value: member.suppliers?.name },
    { label: 'SKU',               value: member.normalized_sku },
    { label: 'EAN',               value: member.normalized_ean },
    { label: 'Navn (normaliseret)', value: member.normalized_name },
    { label: 'Navn (rådata)',     value: rd.name ?? rd.product_name ?? rd.HeadLinePlain ?? rd.Text },
    { label: 'Beskrivelse',       value: rd.description ?? rd.product_description ?? rd.PipedItemDetailsText },
    { label: 'Indkøbspris',       value: fmtPrice(rd.purchase_price) },
    { label: 'Vejl. pris',        value: fmtPrice(rd.sales_price ?? rd.SalesPrice ?? rd.GrossSalesPrice) },
    { label: 'Lager',             value: rd.supplier_stock_quantity ?? rd.InStock },
    { label: 'Vægt (kg)',         value: rd.weight ?? rd.NetWeight },
    { label: 'H × B × D (cm)',   value: [rd.height ?? rd.Height, rd.width ?? rd.Width, rd.length ?? rd.Length].every(v => v != null) ? `${rd.height ?? rd.Height} × ${rd.width ?? rd.Width} × ${rd.length ?? rd.Length}` : null },
    { label: 'Mærke / Brand',     value: rd.brand ?? rd.manufacturer ?? rd.Brand },
    { label: 'Prod.nr.',          value: rd.manufacturer_sku ?? rd.manufacturer_article_number },
    { label: 'Kategori (lev.)',   value: rd.supplier_category ?? rd.category ?? rd.CatParent },
    { label: 'Underkategori',     value: rd.CatChild },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{member.suppliers?.name}</div>
            <h3 className="text-base font-semibold text-gray-900 leading-tight">{member.normalized_name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Primary image */}
          {primary && (
            <div className="w-full bg-gray-50 flex items-center justify-center" style={{ minHeight: 220 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={primary.url}
                alt={primary.alt ?? member.normalized_name}
                className="max-h-64 max-w-full object-contain p-4"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          {/* Thumbnail strip */}
          {rest.length > 0 && (
            <div className="flex gap-2 px-5 py-3 overflow-x-auto border-b border-gray-100">
              {rest.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={img.url}
                  alt={img.alt ?? ''}
                  className="h-16 w-16 object-contain rounded border border-gray-200 bg-gray-50 shrink-0"
                  onError={e => { (e.target as HTMLImageElement).parentElement?.remove() }}
                />
              ))}
            </div>
          )}

          {/* Fields */}
          <div className="px-5 py-4 space-y-3">
            {fields.map(({ label, value }) => {
              if (value == null || value === '' || value === '—') return null
              const str = String(value)
              const isLong = str.length > 80
              return (
                <div key={label} className={isLong ? '' : 'flex gap-4 items-baseline'}>
                  <span className="text-xs text-gray-400 shrink-0 w-36">{label}</span>
                  <span className={`text-sm text-gray-800 ${isLong ? 'mt-1 block whitespace-pre-wrap' : ''}`}>
                    {str}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Raw data accordion */}
          <details className="px-5 pb-6">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none py-2">
              Vis rå leverandørdata
            </summary>
            <pre className="mt-2 text-xs bg-gray-50 rounded p-3 overflow-x-auto text-gray-600 leading-relaxed">
              {JSON.stringify(rd, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </>
  )
}

// ── Tab config ──
type TabKey = 'all' | 'high' | 'medium' | 'variant' | 'confirmed' | 'rejected'

const TABS: { key: TabKey; label: string; status?: string; method?: string; confidence?: string }[] = [
  { key: 'all',       label: 'Alle afventer',           status: 'pending_review' },
  { key: 'high',      label: 'EAN-match',               status: 'pending_review', confidence: 'high'   },
  { key: 'medium',    label: 'Fuzzy navn',              status: 'pending_review', confidence: 'medium' },
  { key: 'variant',   label: 'Varianter',               status: 'pending_review', method: 'variant,parent_sku' },
  { key: 'confirmed', label: 'Bekræftet gruppering',    status: 'confirmed'      },
  { key: 'rejected',  label: 'Afvist',                  status: 'rejected'       },
]

// ── Group Card ──
function GroupCard({
  group,
  onUpdate,
}: {
  group:    MatchGroup
  onUpdate: (id: string, patch: { suggested_name?: string; status?: string; bad_ean_supplier_ids?: string[] }) => Promise<void>
}) {
  const [editName,        setEditName]        = useState(group.suggested_name ?? '')
  const [loading,         setLoading]         = useState(false)
  const [msg,             setMsg]             = useState<string | null>(null)
  const [showMembers,     setShowMembers]     = useState(true)
  const [detailMember,    setDetailMember]    = useState<MatchMember | null>(null)
  const [rejectMode,      setRejectMode]      = useState(false)       // vis EAN-markering inden afvisning
  const [badEanSuppliers, setBadEanSuppliers] = useState<Set<string>>(new Set())

  const conf     = CONFIDENCE_LABELS[group.match_confidence] ?? CONFIDENCE_LABELS.low
  const isSingle = group.match_method === 'single'
  const isEan    = group.match_method === 'ean'

  async function handleConfirm() {
    setLoading(true)
    setMsg(null)
    await onUpdate(group.id, { status: 'confirmed', suggested_name: editName })
    setMsg('Bekræftet')
    setShowMembers(false)
    setLoading(false)
  }

  async function handleRejectClick() {
    // EAN-grupper: vis markerings-UI så admin kan notere fejl-EAN leverandører
    if (isEan && group.members.length > 1) {
      setRejectMode(true)
    } else {
      await confirmReject([])
    }
  }

  async function confirmReject(badSupplierIds: string[]) {
    setLoading(true)
    setMsg(null)
    setRejectMode(false)
    await onUpdate(group.id, { status: 'rejected', bad_ean_supplier_ids: badSupplierIds })
    setMsg(badSupplierIds.length > 0
      ? `Afvist — ${badSupplierIds.length} leverandør(er) markeret med fejl-EAN`
      : 'Afvist')
    setShowMembers(false)
    setLoading(false)
  }

  const isActioned = group.status === 'rejected' || group.status === 'product_created' || group.status === 'confirmed'

  return (
    <>
      {detailMember && (
        <MemberDetailPanel
          member={detailMember}
          onClose={() => setDetailMember(null)}
        />
      )}

      <div className="border rounded-lg bg-white overflow-hidden border-gray-200">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${conf.color}`}>
                {conf.label}
              </span>
              {group.match_method === 'ean' && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                  EAN match
                </span>
              )}
              {group.match_method === 'fuzzy_name' && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                  Fuzzy navn
                </span>
              )}
              {isSingle && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">
                  Enkelt leverandør
                </span>
              )}
              {group.match_method === 'parent_sku' && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                  🧩 Variant-familie (lev.)
                </span>
              )}
              {group.match_method === 'variant' && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                  🔀 Variant (navn)
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                {group.supplier_count} {group.supplier_count === 1 ? 'leverandør' : 'leverandører'}
              </span>
              {group.suggested_ean && (
                <span className="text-xs font-mono text-gray-400">EAN: {group.suggested_ean}</span>
              )}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${STATUS_LABELS[group.status]?.color}`}>
                {STATUS_LABELS[group.status]?.label}
              </span>
            </div>

            {/* Auto-confirm failure reason */}
            {group.notes && group.status === 'pending_review' && group.match_method === 'ean' && (
              <div className="mb-2 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span><span className="font-medium">Ikke auto-bekræftet:</span> {group.notes}</span>
              </div>
            )}

            {/* Foreslået navn — editable */}
            {!isActioned && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Foreslået produktnavn</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    list={`names-${group.id}`}
                    placeholder="Vælg eller skriv produktnavn..."
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id={`names-${group.id}`}>
                    {group.members.map(m => (
                      <option key={m.id} value={m.normalized_name} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}

            {isActioned && (
              <div className="mb-2 text-sm font-medium text-gray-700">
                {group.suggested_name ?? '—'}
              </div>
            )}

            {/* Members toggle */}
            <button
              onClick={() => setShowMembers(v => !v)}
              className="text-xs text-blue-600 hover:underline mb-2"
            >
              {showMembers ? '▲ Skjul' : '▼ Vis'} {group.members.length} {group.members.length === 1 ? 'leverandørprodukt' : 'leverandørprodukter'}
            </button>

            {showMembers && (
              <div className="mt-2 space-y-2">
                {group.members.map(m => {
                  const pp  = m.raw_data.purchase_price
                  const qty = Number(m.raw_data.supplier_stock_quantity ?? 0)
                  const hasImages = ((m.raw_data.supplier_images as SupplierImage[] | undefined) ?? []).length > 0
                  return (
                    <button
                      key={m.id}
                      onClick={() => setDetailMember(m)}
                      className="w-full text-left bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1 transition-colors group cursor-pointer"
                      title="Klik for at se produktdetaljer"
                    >
                      <div>
                        <span className="text-gray-400 block">Leverandør</span>
                        <span className="font-medium text-gray-800 group-hover:text-blue-700">{m.suppliers?.name ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">SKU</span>
                        <span className="font-mono text-gray-700">{m.normalized_sku}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Navn</span>
                        <span className="text-gray-700">{m.normalized_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Indkøbspris</span>
                        <span className="text-gray-700">{fmtPrice(pp)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Lager</span>
                        <span className={qty > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>{qty}</span>
                      </div>
                      <div className="flex items-end justify-between col-span-1">
                        {m.normalized_ean ? (
                          <div>
                            <span className="text-gray-400 block">EAN</span>
                            <span className="font-mono text-gray-600">{m.normalized_ean}</span>
                          </div>
                        ) : <div />}
                        <div className="flex items-center gap-1 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                          {hasImages && <span>🖼</span>}
                          <span>Detaljer →</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Action feedback */}
            {msg && (
              <div className={`mt-2 text-xs px-2 py-1 rounded ${
                msg.startsWith('Fejl') || msg.includes('påkrævet') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {msg}
              </div>
            )}

            {/* Afvis EAN-gruppe: marker fejl-EAN leverandører */}
            {rejectMode && (
              <div className="mt-3 border border-orange-200 bg-orange-50 rounded-lg px-3 py-3">
                <p className="text-xs font-medium text-orange-800 mb-2">
                  ⚠️ Marker hvilke leverandører der har forkert EAN-data for dette produkt
                </p>
                <p className="text-xs text-orange-600 mb-3">
                  Markerede leverandørers EAN <strong>{group.suggested_ean}</strong> udelukkes fra fremtidige auto-grupperinger og imports.
                </p>
                <div className="space-y-1.5 mb-3">
                  {group.members.map(m => {
                    const sid = (m as { supplier_id?: string }).supplier_id ?? ''
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={badEanSuppliers.has(sid)}
                          onChange={e => {
                            setBadEanSuppliers(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.add(sid) : next.delete(sid)
                              return next
                            })
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="font-medium text-gray-800">{m.suppliers?.name ?? sid}</span>
                        <span className="text-gray-400 font-mono">{m.normalized_ean}</span>
                        <span className="text-gray-400">— {m.normalized_name}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmReject([...badEanSuppliers])}
                    disabled={loading}
                    className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-40"
                  >
                    Bekræft afvisning
                  </button>
                  <button
                    onClick={() => confirmReject([])}
                    disabled={loading}
                    className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Afvis uden at markere EAN
                  </button>
                  <button
                    onClick={() => setRejectMode(false)}
                    disabled={loading}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
                  >
                    Annuller
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!isActioned && !rejectMode && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  Bekræft leverandørgruppering
                </button>
                <button
                  onClick={handleRejectClick}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  Afvis
                </button>
              </div>
            )}

            {group.status === 'confirmed' && (
              <div className="mt-3 text-xs text-blue-600 bg-blue-50 rounded px-3 py-2">
                Gå til <a href="/staging" className="font-medium underline">Til gennemgang</a> for at oprette produktet
              </div>
            )}

            {group.product_id && (
              <a
                href={`/products/${group.product_id}`}
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                Åbn produkt →
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Pipeline step type ──
type PipelineStep = {
  stage:    string
  status:   'idle' | 'running' | 'done' | 'error'
  message?: string
  detail?:  string
}

const PIPELINE_STAGES = [
  { key: 'categories',   label: '1 · Kategorier',        icon: '🗂' },
  { key: 'matching',     label: '2 · Matching',           icon: '🔗' },
  { key: 'auto_confirm', label: '3 · Auto-bekræft',       icon: '✅' },
  { key: 'auto_create',  label: '4 · Opret produkter',    icon: '📦' },
  { key: 'remap',        label: '5 · Kategorisér',        icon: '🏷️' },
  { key: 'suggestions',  label: '6 · Match-forslag',      icon: '💡' },
]

// ── Pipeline Panel ──
function PipelinePanel({ onDone }: { onDone: () => void }) {
  const [steps,    setSteps]    = useState<Record<string, PipelineStep>>({})
  const [running,  setRunning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [summary,  setSummary]  = useState<Record<string, number> | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  function startPipeline() {
    if (running) return
    setRunning(true)
    setDone(false)
    setError(null)
    setSummary(null)
    setSteps({})

    const es = new EventSource('/api/pipeline/run')
    esRef.current = es

    es.onmessage = (e: MessageEvent<string>) => {
      const ev = JSON.parse(e.data) as Record<string, unknown>
      const stage = ev.stage as string

      if (stage === 'done') {
        setSummary(ev.summary as Record<string, number>)
        setDone(true)
        setRunning(false)
        es.close()
        onDone()
        return
      }

      if (stage === 'error') {
        setError(ev.message as string)
        setRunning(false)
        es.close()
        return
      }

      setSteps(prev => {
        const status = ev.status as string === 'done' ? 'done' : ev.status as string === 'running' ? 'running' : 'idle'
        let detail: string | undefined
        if (ev.updated != null)       detail = `${ev.updated} kategorier opdateret`
        if (ev.confirmed != null)     detail = `${ev.confirmed} bekræftet`
        if (ev.created != null)       detail = `${ev.created} produkter oprettet`
        if (ev.groups_created != null) detail = `${ev.groups_created} grupper oprettet`
        if (ev.populated != null)     detail = `${ev.populated} forslag tilføjet`
        return { ...prev, [stage]: { stage, status: status as PipelineStep['status'], message: ev.message as string, detail } }
      })
    }

    es.onerror = () => {
      setError('Forbindelsesfejl — prøv igen')
      setRunning(false)
      es.close()
    }
  }

  useEffect(() => () => { esRef.current?.close() }, [])

  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-5 text-white mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base mb-0.5">🚀 Onboarding pipeline</h3>
          <p className="text-gray-400 text-sm">
            Kører automatisk: kategorioprydning → matching → auto-bekræft → produktoprettelse → kategorisering → match-forslag
          </p>
        </div>
        <button
          onClick={startPipeline}
          disabled={running}
          className="shrink-0 px-5 py-2 bg-white text-gray-900 font-semibold text-sm rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center gap-2"
        >
          {running && <span className="inline-block w-3.5 h-3.5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />}
          {running ? 'Kører pipeline…' : done ? '↺ Kør igen' : '▶ Kør pipeline'}
        </button>
      </div>

      {/* Step progress */}
      {(running || done || error) && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE_STAGES.map(s => {
            const step = steps[s.key]
            const status = step?.status ?? 'idle'
            return (
              <div key={s.key} className={`rounded-lg px-3 py-2.5 text-xs transition-colors ${
                status === 'done'    ? 'bg-green-500/20 border border-green-500/30' :
                status === 'running' ? 'bg-blue-500/20 border border-blue-400/40' :
                                       'bg-white/5 border border-white/10'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span>{s.icon}</span>
                  {status === 'running' && (
                    <span className="inline-block w-2.5 h-2.5 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  )}
                  {status === 'done' && <span className="text-green-400">✓</span>}
                  <span className={`font-medium ${status === 'idle' ? 'text-gray-500' : 'text-white'}`}>
                    {s.label}
                  </span>
                </div>
                {step?.detail && (
                  <div className="text-gray-300 leading-tight">{step.detail}</div>
                )}
                {step?.message && !step.detail && (
                  <div className="text-gray-400 leading-tight truncate">{step.message}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {done && summary && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="bg-white/10 rounded px-3 py-1">🗂 {summary.categories_updated ?? 0} kategorier opdateret</span>
          <span className="bg-white/10 rounded px-3 py-1">🔗 {summary.groups_created ?? 0} nye grupper</span>
          <span className="bg-white/10 rounded px-3 py-1">✅ {summary.auto_confirmed ?? 0} auto-bekræftet</span>
          <span className="bg-green-500/20 border border-green-500/30 rounded px-3 py-1 font-semibold">
            📦 {summary.products_created ?? 0} produkter oprettet
          </span>
          <span className="bg-white/10 rounded px-3 py-1">🏷️ {summary.products_remapped ?? 0} kategoriseret</span>
          {(summary.suggestions_populated ?? 0) > 0 && (
            <span className="bg-white/10 rounded px-3 py-1">💡 {summary.suggestions_populated} match-forslag</span>
          )}
          {(summary.remaining ?? 0) > 0 && (
            <span className="bg-orange-500/20 border border-orange-400/30 rounded px-3 py-1 text-orange-200">
              ⏳ {summary.remaining} tilbage — kør pipeline igen
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 text-sm text-red-300 bg-red-900/30 rounded px-3 py-2">⚠️ {error}</div>
      )}
    </div>
  )
}

// ── Main Page ──
export default function MatchingPage() {
  const [groups,     setGroups]     = useState<MatchGroup[]>([])
  const [stats,      setStats]      = useState<Stats | null>(null)
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState<TabKey>('high')

  const tabConfig = TABS.find(t => t.key === activeTab) ?? TABS[0]

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), per_page: '50' })
    if (tabConfig.status)     params.set('status',     tabConfig.status)
    if (tabConfig.confidence) params.set('confidence', tabConfig.confidence)
    if (tabConfig.method)     params.set('method',     tabConfig.method)
    if (activeTab === 'all')  params.set('status', 'pending_review')

    const res  = await fetch(`/api/matching/groups?${params}`)
    const json = await res.json()
    setGroups(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    if (json.stats) setStats(json.stats)
    setLoading(false)
  }, [activeTab, page, tabConfig.status, tabConfig.confidence, tabConfig.method])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  async function handleUpdate(id: string, patch: { suggested_name?: string; status?: string; bad_ean_supplier_ids?: string[] }) {
    await fetch(`/api/matching/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } as MatchGroup : g))
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">Leverandør-match</h2>
        <p className="text-sm text-gray-500 mb-1">Identificér hvilke leverandører der sælger samme produkt — bekræft eller afvis leverandørgrupperinger</p>
        <div className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 leading-relaxed">
          <span className="font-medium text-blue-800">Hvad gør du her?</span>
          <span className="text-blue-700"> Her bekræfter du at de viste leverandørprodukter er <em>det samme produkt</em> — eventuelt solgt af flere leverandører. Det kan også være varianter af samme produkt (f.eks. samme fender i forskellig størrelse eller farve fra samme eller flere leverandører). Bekræftede grupperinger går videre til <a href="/staging" className="underline font-medium">Til gennemgang</a>, hvor produktet oprettes i kataloget.</span>
        </div>

        {/* Pipeline panel */}
        <PipelinePanel onDone={fetchGroups} />

        {/* Stats */}
        {stats && (
          <div className="flex gap-3 flex-wrap text-sm mb-4">
            {[
              { label: 'Afventer gennemgang',  value: stats.pending,    color: 'text-orange-700' },
              { label: 'EAN-match (afventer)', value: stats.high,       color: 'text-green-700'  },
              { label: 'Fuzzy (afventer)',     value: stats.medium,     color: 'text-yellow-700' },
              { label: 'Varianter (afventer)', value: stats.variant,    color: 'text-purple-700' },
              { label: 'Bekræftet gruppering', value: stats.confirmed,  color: 'text-blue-700'   },
              { label: 'Produkt oprettet',     value: stats.created,    color: 'text-emerald-700'},
              { label: 'Afvist',               value: stats.rejected,   color: 'text-gray-400'   },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2 min-w-[110px]">
                <div className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString('da-DK')}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden w-fit text-sm">
          {TABS.map(tab => {
            const count = stats ? (
              tab.key === 'all'       ? stats.pending :
              tab.key === 'high'      ? stats.high :
              tab.key === 'medium'    ? stats.medium :
              tab.key === 'variant'   ? stats.variant :
              tab.key === 'confirmed' ? stats.confirmed :
              tab.key === 'rejected'  ? stats.rejected :
              null
            ) : null
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setPage(1) }}
                className={`px-4 py-1.5 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {count != null && count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.key === 'all' || tab.key === 'high' || tab.key === 'medium'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count.toLocaleString('da-DK')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Henter grupper...</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="text-2xl mb-2">🎯</div>
            <div className="font-medium text-gray-500 mb-1">Ingen leverandørgrupperinger afventer gennemgang</div>
            <div className="text-sm">Kør pipeline ovenfor for at importere og matche leverandørprodukter</div>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {groups.map(g => (
              <GroupCard
                key={g.id}
                group={g}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">
            Side {page} / {totalPages} — {total.toLocaleString('da-DK')} leverandørgrupperinger
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30"
            >
              Forrige
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30"
            >
              Næste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
