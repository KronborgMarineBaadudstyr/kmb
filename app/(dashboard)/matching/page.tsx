'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ──

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
  match_method:     'ean' | 'fuzzy_name' | 'manual' | 'single'
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
  high:      number
  medium:    number
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
  pending_review:  { label: 'Afventer',      color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  confirmed:       { label: 'Bekræftet',     color: 'bg-blue-50 text-blue-700 border-blue-200'       },
  rejected:        { label: 'Afvist',        color: 'bg-gray-100 text-gray-500 border-gray-200'      },
  product_created: { label: 'Produkt oprettet', color: 'bg-green-50 text-green-700 border-green-200' },
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

// ── Tab config ──
type TabKey = 'all' | 'high' | 'medium' | 'single' | 'confirmed' | 'rejected'

const TABS: { key: TabKey; label: string; status?: string; method?: string; confidence?: string }[] = [
  { key: 'all',       label: 'Alle',             status: 'pending_review' },
  { key: 'high',      label: 'Høj konfidens',    status: 'pending_review', confidence: 'high'   },
  { key: 'medium',    label: 'Lav konfidens',    status: 'pending_review', confidence: 'medium' },
  { key: 'single',    label: 'Enkelt leverandør', status: 'pending_review', method: 'single'    },
  { key: 'confirmed', label: 'Bekræftet',        status: 'confirmed'      },
  { key: 'rejected',  label: 'Afvist',           status: 'rejected'       },
]

// ── Group Card ──
function GroupCard({
  group,
  onUpdate,
  onCreateProduct,
  selected,
  onSelect,
}: {
  group:           MatchGroup
  onUpdate:        (id: string, patch: { suggested_name?: string; status?: string }) => Promise<void>
  onCreateProduct: (id: string, name: string) => Promise<void>
  selected:        boolean
  onSelect:        (id: string, checked: boolean) => void
}) {
  const [editName,    setEditName]    = useState(group.suggested_name ?? '')
  const [loading,     setLoading]     = useState(false)
  const [msg,         setMsg]         = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)

  const conf = CONFIDENCE_LABELS[group.match_confidence] ?? CONFIDENCE_LABELS.low
  const isSingle = group.match_method === 'single'

  async function handleConfirm() {
    setLoading(true)
    setMsg(null)
    await onUpdate(group.id, { status: 'confirmed', suggested_name: editName })
    setMsg('Bekræftet')
    setLoading(false)
  }

  async function handleReject() {
    setLoading(true)
    setMsg(null)
    await onUpdate(group.id, { status: 'rejected' })
    setMsg('Afvist')
    setLoading(false)
  }

  async function handleCreateProduct() {
    if (!editName.trim()) { setMsg('Produktnavn er påkrævet'); return }
    setLoading(true)
    setMsg(null)
    await onCreateProduct(group.id, editName.trim())
    setMsg('Produkt oprettet!')
    setLoading(false)
  }

  const isActioned = group.status === 'rejected' || group.status === 'product_created' || group.status === 'confirmed'

  return (
    <div className={`border rounded-lg bg-white overflow-hidden ${selected ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200'}`}>
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Checkbox */}
        {!isActioned && (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(group.id, e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        )}

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
            {showMembers ? '▲ Skjul' : `▼ Vis`} {group.members.length} leverandørlinjer
          </button>

          {showMembers && (
            <div className="mt-2 space-y-2">
              {group.members.map(m => {
                const pp  = m.raw_data.purchase_price
                const qty = Number(m.raw_data.supplier_stock_quantity ?? 0)
                return (
                  <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <span className="text-gray-400 block">Leverandør</span>
                      <span className="font-medium text-gray-800">{m.suppliers?.name ?? '—'}</span>
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
                    {m.normalized_ean && (
                      <div>
                        <span className="text-gray-400 block">EAN</span>
                        <span className="font-mono text-gray-600">{m.normalized_ean}</span>
                      </div>
                    )}
                  </div>
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

          {/* Action buttons */}
          {!isActioned && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {isSingle ? (
                <button
                  onClick={handleCreateProduct}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                >
                  Opret produkt
                </button>
              ) : (
                <>
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    Bekræft gruppe
                  </button>
                  <button
                    onClick={handleCreateProduct}
                    disabled={loading}
                    className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                  >
                    Opret produkt
                  </button>
                </>
              )}
              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Afvis
              </button>
            </div>
          )}

          {group.product_id && (
            <a
              href={`/products?id=${group.product_id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Åbn produkt →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──
export default function MatchingPage() {
  const [groups,      setGroups]      = useState<MatchGroup[]>([])
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<TabKey>('high')
  const [selected,    setSelected]    = useState<Set<string>>(new Set())

  // SSE state
  const [running,     setRunning]     = useState(false)
  const [progress,    setProgress]    = useState<ProgressEvent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

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

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => { eventSourceRef.current?.close() }
  }, [])

  function startMatching() {
    if (running) return
    setRunning(true)
    setProgress({ stage: 'ean_phase', message: 'Starter matching-motor...' })

    const es = new EventSource('/api/matching/run')
    eventSourceRef.current = es

    es.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as ProgressEvent
      setProgress(data)
      if (data.stage === 'done' || data.stage === 'error') {
        es.close()
        setRunning(false)
        if (data.stage === 'done') fetchGroups()
      }
    }

    es.onerror = () => {
      setProgress({ stage: 'error', message: 'SSE-forbindelsen fejlede' })
      es.close()
      setRunning(false)
    }
  }

  async function handleUpdate(id: string, patch: { suggested_name?: string; status?: string }) {
    await fetch(`/api/matching/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } as MatchGroup : g))
  }

  async function handleCreateProduct(id: string, name: string) {
    const res  = await fetch(`/api/matching/${id}/create-product`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chosen_name: name }),
    })
    const json = await res.json() as { ok?: boolean; product_id?: string; error?: string }
    if (!json.ok) throw new Error(json.error ?? 'Ukendt fejl')
    setGroups(prev => prev.map(g =>
      g.id === id ? { ...g, status: 'product_created', product_id: json.product_id ?? null } : g
    ))
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  async function bulkCreateProducts() {
    const ids = [...selected]
    for (const id of ids) {
      const group = groups.find(g => g.id === id)
      if (!group) continue
      const name = group.suggested_name?.trim() ?? ''
      if (!name) continue
      try {
        await handleCreateProduct(id, name)
      } catch {
        // continue with others
      }
    }
    setSelected(new Set())
  }

  const stageLabel: Record<string, string> = {
    ean_phase:    'EAN-fase',
    fuzzy_phase:  'Fuzzy-fase',
    singles_phase:'Enkelt-leverandør fase',
    done:         'Færdig',
    error:        'Fejl',
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Produkt-matching</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Kryds-leverandør matching af staging-produkter
            </p>
          </div>
          <button
            onClick={startMatching}
            disabled={running}
            className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2"
          >
            {running && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {running ? 'Kører...' : 'Kør matching'}
          </button>
        </div>

        {/* Progress */}
        {progress && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            progress.stage === 'error' ? 'bg-red-50 text-red-700' :
            progress.stage === 'done'  ? 'bg-green-50 text-green-700' :
                                         'bg-blue-50 text-blue-700'
          }`}>
            <div className="font-medium mb-0.5">
              {stageLabel[progress.stage] ?? progress.stage}
            </div>
            <div>{progress.message}</div>
            {progress.groups_created != null && (
              <div className="text-xs mt-1 opacity-75">
                {progress.groups_created} grupper · {progress.rows_assigned ?? 0} rækker tildelt
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="flex gap-4 flex-wrap text-sm mb-4">
            {[
              { label: 'I alt',               value: stats.total,     color: 'text-gray-900' },
              { label: 'Høj konfidens (EAN)',  value: stats.high,      color: 'text-green-700' },
              { label: 'Fuzzy',               value: stats.medium,    color: 'text-yellow-700' },
              { label: 'Enkelt leverandør',   value: stats.single,    color: 'text-gray-600' },
              { label: 'Bekræftet',           value: stats.confirmed, color: 'text-blue-700' },
              { label: 'Produkt oprettet',    value: stats.created,   color: 'text-emerald-700' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2 min-w-[100px]">
                <div className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString('da-DK')}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden w-fit text-sm">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); setSelected(new Set()) }}
              className={`px-4 py-1.5 transition-colors whitespace-nowrap ${
                activeTab === tab.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {selected.size > 0 && (
        <div className="border-b border-gray-200 bg-blue-50 px-6 py-2 flex items-center gap-3 shrink-0">
          <span className="text-sm text-blue-700 font-medium">{selected.size} grupper valgt</span>
          <button
            onClick={bulkCreateProducts}
            className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
          >
            Opret {selected.size} produkter
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Ryd valg
          </button>
        </div>
      )}

      {/* ── List ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Henter grupper...</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="text-2xl mb-2">🎯</div>
            <div>Ingen grupper i denne kategori</div>
            {!stats?.total && (
              <div className="mt-2 text-sm">
                Klik &quot;Kør matching&quot; for at starte matching-processen
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {groups.map(g => (
              <GroupCard
                key={g.id}
                group={g}
                onUpdate={handleUpdate}
                onCreateProduct={handleCreateProduct}
                selected={selected.has(g.id)}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">
            Side {page} / {totalPages} — {total.toLocaleString('da-DK')} grupper
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
