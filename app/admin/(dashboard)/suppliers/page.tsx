'use client'

import { useEffect, useState, useRef } from 'react'
import { ImportFlow } from '../_import-flow'
import { scheduleFor } from '@/lib/cron-schedule'

type ImportSummary = {
  stage:     'done' | 'error' | 'partial'   // partial = opdelt kørsel, der ikke er nået hele vejen endnu
  message:   string
  total:     number
  processed?: number
  matched:   number
  updated:   number
  staged:    number
  errors:    number
  timestamp: string
  started_at?: string                 // gemmes af serveren (lib/import-run.ts)
  source?:   'manual' | 'cron'
  kind?:     'products' | 'stock'
  test?:     boolean          // kun på gamle kørsler — testmodus er fjernet
  chunks?:   number                   // antal dele en opdelt kørsel har brugt
}

const KIND_LABEL   = { products: 'Produkter', stock: 'Lager' } as const
const SOURCE_LABEL = { manual: 'Manuel', cron: 'Automatisk' } as const
const fmtTime = (iso: string) => new Date(iso).toLocaleString('da-DK', { hour12: false, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function fmtDuration(from?: string, to?: string) {
  if (!from || !to) return null
  const sec = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)
  if (!(sec >= 0)) return null
  return sec < 60 ? `${sec} sek` : `${Math.floor(sec / 60)} min ${sec % 60} sek`
}

type Supplier = {
  id:                  string
  name:                string
  data_format:         string | null
  api_url:             string | null
  api_auth_type:       string | null
  ftp_host:            string | null
  sync_interval_hours: number
  last_synced_at:      string | null
  active:              boolean
  notes:               string | null
  sync_state:          Record<string, unknown> | null
  global_priority:     number | null
}

type ImportProgress = {
  stage:     'fetching' | 'connecting' | 'downloading' | 'parsing' | 'importing' | 'partial' | 'done' | 'error'
  total:     number
  processed: number
  matched:   number
  staged:    number
  updated:   number
  skipped?:  number
  errors:    number
  message:   string
}

// Leverandører med implementeret import + evt. krav
const IMPORT_CONFIG: Record<string, { endpoint: string; needsFtp?: boolean; needsFile?: boolean }> = {
  Engholm:              { endpoint: '/api/import/engholm'    },
  Palby:                { endpoint: '/api/import/palby',      needsFtp: true },
  Scanmarine:           { endpoint: '/api/import/scanmarine' },
  'HF Industri Marine': { endpoint: '/api/import/hf-industri', needsFile: true },
  'Columbus Marine':    { endpoint: '/api/import/columbus' },
  'Kap-Horn':           { endpoint: '/api/import/kaphorn' },
}

const FORMAT_LABELS: Record<string, string> = {
  api: 'API', ftp: 'FTP', excel: 'Excel', manual: 'Manuel',
}

function getLastSummary(s: Supplier): ImportSummary | null {
  return (s.sync_state?.last_import_summary as ImportSummary) ?? null
}

// Seneste kørsel pr. type (produkter / lager). Ældre data har kun last_import_summary.
function getSummaries(s: Supplier): ImportSummary[] {
  const products = s.sync_state?.last_products_summary as ImportSummary | undefined
  const stock    = s.sync_state?.last_stock_summary    as ImportSummary | undefined
  if (products || stock) return [products, stock].filter((x): x is ImportSummary => !!x)
  const last = getLastSummary(s)
  return last ? [last] : []
}

// Bruges kun når forbindelsen afbrydes (serveren er stoppet og kan ikke selv gemme). Ellers gemmer serveren (lib/import-run.ts)
async function saveImportSummary(supplierId: string, data: ImportProgress, kind: 'products' | 'stock') {
  const summary: ImportSummary = {
    stage:     data.stage as ImportSummary['stage'],
    message:   data.message,
    total:     data.total,
    matched:   data.matched,
    updated:   data.updated,
    staged:    data.staged,
    errors:    data.errors,
    timestamp: new Date().toISOString(),
    source:    'manual',
    kind,
  }
  await fetch(`/api/suppliers/${supplierId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sync_state: { last_import_summary: summary, [`last_${kind}_summary`]: summary } }),
  }).catch(() => {})
}

// Varenumre der står flere gange i leverandørens fil (lib/import-run.ts → sync_state.duplicate_skus).
// Importen bruger kun én linje pr. varenummer; her kan admin se forskellen og vælge hvilken.
type DuplicateSku = { sku: string; used: number; entries: Record<string, string | number | null>[]; auto?: string }
type DuplicateReport = { checked_at: string; count: number; attention?: number; items: DuplicateSku[] }

function DuplicatesPanel({ supplier, onSaved }: { supplier: Supplier; onSaved: (syncState: Record<string, unknown>) => void }) {
  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const report = supplier.sync_state?.duplicate_skus as DuplicateReport | undefined
  if (!report || report.count === 0) return null
  const choice = (supplier.sync_state?.duplicate_choice ?? {}) as Record<string, number>

  async function choose(sku: string, idx: number) {
    setSaving(sku)
    const nextChoice = { ...choice, [sku]: idx }
    const nextReport = { ...report!, items: report!.items.map(d => d.sku === sku ? { sku: d.sku, entries: d.entries, used: idx } : d) }
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync_state: { duplicate_choice: nextChoice, duplicate_skus: nextReport } }),
    })
    setSaving(null)
    if (res.ok) onSaved({ ...(supplier.sync_state ?? {}), duplicate_choice: nextChoice, duplicate_skus: nextReport })
    else alert('Kunne ikke gemme valget')
  }

  const fmt = (v: string | number | null) => v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('da-DK') : v
  const needs = report.items.filter(d => !d.auto)
  const autos = report.items.filter(d => d.auto)
  const attention = report.attention ?? needs.length
  const tone = attention > 0 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600'

  const table = (d: DuplicateSku) => {
            const fields = [...new Set(d.entries.flatMap(e => Object.keys(e)))]
            const differs = (f: string) => new Set(d.entries.map(e => String(e[f] ?? ''))).size > 1
            return (
              <div key={d.sku} className="bg-white border border-amber-200 rounded overflow-x-auto">
                {d.auto && <div className="px-2 py-1 text-[11px] text-gray-500 bg-gray-50 border-b border-amber-100">Valgt automatisk: {d.auto}. Vælg en anden linje for at overstyre.</div>}
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-amber-100/60 text-amber-900">
                    <tr>
                      <th className="px-2 py-1 text-left font-mono font-semibold whitespace-nowrap">{d.sku}</th>
                      {fields.map(f => <th key={f} className={`px-2 py-1 text-left font-medium whitespace-nowrap ${differs(f) ? 'text-amber-900' : 'text-amber-900/50'}`}>{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {d.entries.map((e, i) => (
                      <tr key={i} className={`border-t border-amber-100 ${d.used === i ? 'bg-green-50' : ''}`}>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                            <input type="radio" name={`dup-${supplier.id}-${d.sku}`} checked={d.used === i}
                              disabled={saving === d.sku} onChange={() => choose(d.sku, i)} className="accent-green-600" />
                            {d.used === i ? 'Bruges' : `Linje ${i + 1}`}
                          </label>
                        </td>
                        {fields.map(f => (
                          <td key={f} className={`px-2 py-1 ${differs(f) ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{fmt(e[f] ?? null)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
  }

  return (
    <div className={`mt-3 border-t border-gray-100 pt-3 text-xs rounded px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span>
          {attention > 0 ? '⚠ ' : ''}<strong>{report.count.toLocaleString('da-DK')}</strong> {report.count === 1 ? 'varenummer står' : 'varenumre står'} flere gange i leverandørens fil
          {attention > 0
            ? <> — <strong>{attention.toLocaleString('da-DK')}</strong> kræver dit valg{autos.length > 0 && `, ${autos.length.toLocaleString('da-DK')} er løst automatisk`}</>
            : ' — alle løst automatisk'}
          <span className="opacity-60"> · tjekket {fmtTime(report.checked_at)}</span>
        </span>
        <button onClick={() => setOpen(v => !v)} className="underline hover:opacity-70">{open ? 'Skjul' : attention > 0 ? 'Vis og vælg' : 'Vis'}</button>
      </div>
      {open && (
        <div className="mt-2 space-y-3 max-h-[28rem] overflow-y-auto">
          {needs.length > 0 && (
            <p className="text-amber-800">
              Vælg hvilken linje der skal bruges for hvert varenummer. Valget gælder fra næste import. Felter der er forskellige, er fremhævet.
              {report.items.length < report.count && ` Viser de første ${report.items.length}.`}
            </p>
          )}
          {needs.map(table)}
          {autos.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">{autos.length.toLocaleString('da-DK')} løst automatisk (ens linjer eller leverandørens regel) — vis</summary>
              <div className="mt-2 space-y-3">{autos.map(table)}</div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function ErrorLogPopover({ errors }: { errors: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle ml-1">
      <button onClick={() => setOpen(v => !v)} className="underline text-red-500 text-xs hover:text-red-700">
        {open ? 'Skjul' : 'Se fejl'}
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-6 w-[520px] max-h-72 overflow-y-auto bg-white border border-red-200 rounded shadow-lg p-3 text-xs font-mono text-gray-700">
          {errors.map((e, i) => (
            <div key={i} className="border-b border-gray-100 py-1 break-words">{i + 1}. {e}</div>
          ))}
        </div>
      )}
    </span>
  )
}

export default function SuppliersPage() {
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([])
  const [loading,      setLoading]      = useState(true)
  const [importing,    setImporting]    = useState<string | null>(null)
  const [lastImported, setLastImported] = useState<string | null>(null)
  const [progress,     setProgress]     = useState<ImportProgress | null>(null)
  const [selectedFile, setSelectedFile] = useState<Record<string, File>>({})
  const [savingPrio,   setSavingPrio]   = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const progressRef = useRef<ImportProgress | null>(null)   // seneste status, hvis forbindelsen afbrydes
  const chunkRef = useRef(0)                                 // antal færdige dele i en opdelt import

  async function movePriority(id: string, direction: 'up' | 'down') {
    const sorted = [...suppliers].sort((a, b) => (a.global_priority ?? 999) - (b.global_priority ?? 999))
    const idx    = sorted.findIndex(s => s.id === id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    setSavingPrio(true)
    const a = sorted[idx]
    const b = sorted[swapIdx]
    const pA = a.global_priority ?? idx + 1
    const pB = b.global_priority ?? swapIdx + 1

    await Promise.all([
      fetch(`/api/suppliers/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ global_priority: pB }) }),
      fetch(`/api/suppliers/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ global_priority: pA }) }),
    ])

    setSuppliers(prev => {
      const next = [...prev]
      const iA = next.findIndex(s => s.id === a.id)
      const iB = next.findIndex(s => s.id === b.id)
      next[iA] = { ...next[iA], global_priority: pB }
      next[iB] = { ...next[iB], global_priority: pA }
      return next.sort((x, y) => (x.global_priority ?? 999) - (y.global_priority ?? 999))
    })
    setSavingPrio(false)
  }

  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(j => setSuppliers(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  function reloadSuppliers() {
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? []))
  }

  function startImport(supplier: Supplier, mode?: string) {
    if (importing) return

    const cfg = IMPORT_CONFIG[supplier.name]
    if (!cfg) {
      alert(`Import er endnu ikke implementeret for ${supplier.name}`)
      return
    }

    if (cfg.needsFtp && !supplier.ftp_host) {
      alert(`${supplier.name}: FTP-adgang er endnu ikke konfigureret.\nKontakt leverandøren for login og opdater leverandøren i Supabase.`)
      return
    }

    setImporting(supplier.id)
    setProgress(null)

    let url = cfg.endpoint
    if (mode) url += `?mode=${mode}`

    progressRef.current = null
    const kind = mode === 'stock' || mode === 'stock-full' ? 'stock' : 'products'

    // Store importer (Palby, Columbus) kører i dele á ca. 3½ min. Melder en del 'partial',
    // åbnes næste del med ?continue=1, og den fortsætter fra det varenummer, serveren har gemt.
    const connect = (src: string) => {
      const es = new EventSource(src)
      esRef.current = es
      let finished = false

      es.onmessage = (e) => {
        const data: ImportProgress = JSON.parse(e.data)
        progressRef.current = data
        if (data.stage === 'partial') {
          finished = true
          es.close()
          setProgress({ ...data, message: `${data.message} (del ${chunkRef.current + 1} færdig)` })
          chunkRef.current++
          if (esRef.current === es) connect(cfg.endpoint + (cfg.endpoint.includes('?') ? '&' : '?') + 'continue=1')
          return
        }
        setProgress(data)
        if (data.stage === 'done' || data.stage === 'error') {
          finished = true
          es.close()
          setLastImported(supplier.id)
          setImporting(null)
          reloadSuppliers()   // serveren har gemt "Seneste kørsel", før den sendte done/error
        }
      }

      es.onerror = () => {
        if (finished) return
        // Forbindelsen blev afbrudt før importen meldte færdig — typisk fordi den ramte Vercels tidsgrænse (5 min)
        es.close()
        setImporting(null)
        setLastImported(supplier.id)
        const p = progressRef.current
        const aborted: ImportProgress = {
          ...(p ?? { total: 0, processed: 0, matched: 0, staged: 0, updated: 0, errors: 0 }),
          stage: 'error',
          message: `Importen blev afbrudt${p?.processed ? ` efter ${p.processed.toLocaleString('da-DK')} af ${p.total.toLocaleString('da-DK')} varer` : ''} — sandsynligvis ramte den tidsgrænsen på 5 minutter. Det der nåede at blive importeret er gemt, men resten mangler.`,
        }
        setProgress(aborted)
        saveImportSummary(supplier.id, aborted, kind).then(reloadSuppliers)
      }
    }
    chunkRef.current = 0
    connect(url)
  }

  async function startFileImport(supplier: Supplier) {
    if (importing) return
    const cfg = IMPORT_CONFIG[supplier.name]
    if (!cfg) return

    const file = selectedFile[supplier.id]
    if (!file) {
      alert('Vælg en XLSX-fil først')
      return
    }

    setImporting(supplier.id)
    setProgress(null)

    const formData = new FormData()
    formData.append('file', file)

    const url = cfg.endpoint

    try {
      const response = await fetch(url, { method: 'POST', body: formData })
      if (!response.ok || !response.body) {
        throw new Error(`HTTP fejl: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const data: ImportProgress = JSON.parse(line.slice(5).trim())
          setProgress(data)
          if (data.stage === 'done' || data.stage === 'error') {
            setLastImported(supplier.id)
            setImporting(null)
            reloadSuppliers()
          }
        }
      }
    } catch (e: unknown) {
      setProgress(p => p
        ? { ...p, stage: 'error', message: e instanceof Error ? e.message : String(e) }
        : { stage: 'error', total: 0, processed: 0, matched: 0, staged: 0, updated: 0, errors: 1, message: String(e) }
      )
      setImporting(null)
    }
  }

  function stopImport() {
    esRef.current?.close()
    esRef.current = null      // forhindrer at næste del startes
    setImporting(null)
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div className="p-8">
      <ImportFlow className="mb-6" />
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Leverandører</h2>
      <p className="text-gray-500 mb-8">Trin 1: Hent varer, priser og lager ind fra leverandørerne. Importen kører automatisk hver nat — her kan du også starte den manuelt og sætte leverandørprioritet.</p>

      {/* Leverandørliste */}
      {loading ? (
        <div className="text-gray-400">Henter leverandører...</div>
      ) : (
        <>
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
          <p className="font-medium mb-1">Global leverandørprioritet</p>
          <p className="text-xs text-blue-700">
            Rækkefølgen herunder afgør hvilken leverandør vi foretrækker når et produkt fås fra flere leverandører.
            Leverandør #1 vælges som standard — med mindre du sætter en anden prioritet direkte på produktet.
            Brug pilene til at justere rækkefølgen.
          </p>
        </div>

        <div className="space-y-4">
          {suppliers.map((s) => {
            const lastSummary = getLastSummary(s)
            const sortedSuppliers = [...suppliers].sort((a, b) => (a.global_priority ?? 999) - (b.global_priority ?? 999))
            const posIdx = sortedSuppliers.findIndex(x => x.id === s.id)
            const isFirst = posIdx === 0
            const isLast  = posIdx === sortedSuppliers.length - 1
            return (
              <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      {/* Priority badge + arrows */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold text-white bg-gray-700 rounded-full w-6 h-6 flex items-center justify-center">
                          {posIdx + 1}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => movePriority(s.id, 'up')} disabled={isFirst || savingPrio}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
                          <button onClick={() => movePriority(s.id, 'down')} disabled={isLast || savingPrio}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
                        </div>
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                      {s.data_format && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          {FORMAT_LABELS[s.data_format] ?? s.data_format}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-500 space-y-1">
                      {s.api_url && (
                        <div><span className="text-gray-400 w-28 inline-block">API URL</span>{s.api_url}</div>
                      )}
                      <div>
                        <span className="text-gray-400 w-28 inline-block">Automatisk</span>
                        {(() => {
                          const lines = scheduleFor(s.name)
                          if (lines.length === 0) return <span className="text-gray-500">{IMPORT_CONFIG[s.name]?.needsFile ? 'Nej — manuel filupload' : 'Nej — kun manuel import'}</span>
                          return lines.map((l, i) => <span key={i}>{i > 0 && ' · '}{KIND_LABEL[l.kind]} {l.text}</span>)
                        })()}
                      </div>
                      <div>
                        <span className="text-gray-400 w-28 inline-block">Data opdateret</span>
                        {s.last_synced_at
                          ? fmtTime(s.last_synced_at)
                          : <span className="text-orange-500">Aldrig</span>}
                      </div>
                      {(() => {
                        // Serveren noterer når en kørsel starter. Er den nyere end seneste afsluttede, blev den ikke færdig.
                        const started = typeof s.sync_state?.last_run_started_at === 'string' ? s.sync_state.last_run_started_at : null
                        if (!started || importing === s.id) return null
                        const finished = [lastSummary, ...getSummaries(s)].filter((x): x is ImportSummary => !!x)
                          .map(x => new Date(x.timestamp).getTime())
                        if (finished.some(t => t >= new Date(started).getTime())) return null
                        const recent = Date.now() - new Date(started).getTime() < 10 * 60_000
                        return (
                          <div className="text-orange-600">
                            <span className="text-gray-400 w-28 inline-block">Ufuldført</span>
                            Kørsel startet {fmtTime(started)} {recent ? 'kører måske stadig' : 'blev ikke færdig (fx stoppet af tidsgrænsen på 5 min)'}
                          </div>
                        )
                      })()}
                      {s.notes && (
                        <div className="text-xs text-gray-400 mt-2 max-w-xl">{s.notes}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-6 flex-wrap justify-end">
                    {importing === s.id ? (
                      <button onClick={stopImport}
                        className="px-4 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                        Stop
                      </button>
                    ) : IMPORT_CONFIG[s.name]?.needsFile ? (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-gray-500">
                              {selectedFile[s.id] ? selectedFile[s.id].name : 'Ingen fil valgt'}
                            </span>
                            <span className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-700">
                              Vælg fil…
                            </span>
                            <input
                              type="file"
                              accept=".xlsx"
                              className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0]
                                if (f) setSelectedFile(prev => ({ ...prev, [s.id]: f }))
                              }}
                            />
                          </label>
                          <button
                            onClick={() => startFileImport(s)}
                            disabled={!!importing || !selectedFile[s.id]}
                            title="Upload XLSX-fil fra HF Industri Marine og importer produkter. Matcher via EAN og sender ukendte til gennemgang."
                            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                          >
                            Upload & Importér
                          </button>
                        </div>
                      </div>
                    ) : IMPORT_CONFIG[s.name] ? (
                      <div className="flex flex-col items-end gap-2">
                        {/* Palby: lager-knapper øverst */}
                        {s.name === 'Palby' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Lager:</span>
                            <button
                              onClick={() => startImport(s, 'stock-full')}
                              disabled={!!importing}
                              title="Henter komplet lagerstatus-fil fra Palby FTP og opdaterer alle kendte produkter. Brug ved første opsætning."
                              className="px-3 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-40"
                            >
                              Fuld opdatering
                            </button>
                            <button
                              onClick={() => startImport(s, 'stock')}
                              disabled={!!importing}
                              title="Henter kun nye delta-lagerfiler siden sidst — hurtig opdatering. Kræver at 'Fuld opdatering' er kørt mindst én gang."
                              className="px-3 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-40"
                            >
                              Nye ændringer
                            </button>
                          </div>
                        )}

                        {/* Produkt-import */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startImport(s)}
                            disabled={!!importing}
                            title={
                              s.name === 'Palby'
                                ? 'Henter komplet produktfil fra Palby FTP, matcher via EAN og opdaterer produkt-leverandør data. Ukendte produkter sendes til gennemgang.'
                                : s.name === 'Engholm'
                                ? 'Henter alle produkter fra Engholm API, matcher via EAN/GTIN og opdaterer data. Ukendte produkter sendes til gennemgang.'
                                : s.name === 'Scanmarine'
                                ? 'Henter CSV-fil fra Scanmarine, matcher via EAN og opdaterer data. Ukendte produkter sendes til gennemgang.'
                                : s.name === 'Columbus Marine'
                                ? 'Henter ColumbusStock.xml fra Columbus Marine FTP, matcher via EAN og opdaterer data. Ukendte produkter sendes til gennemgang.'
                                : s.name === 'Kap-Horn'
                                ? 'Henter productfeed.xml fra Kap-Horn FTP, matcher via EAN og opdaterer data inkl. spec-PDFs. Ukendte produkter sendes til gennemgang.'
                                : 'Importér produktdata fra leverandøren og match mod eksisterende produkter'
                            }
                            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                          >
                            Importér produkter
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Import ikke implementeret</span>
                    )}
                  </div>
                </div>

                {/* Aktiv import — progress */}
                {importing === s.id && progress && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">{progress.message}</span>
                      <span className="text-gray-400 tabular-nums">{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                      <div className={`h-1.5 rounded-full transition-all ${
                        progress.stage === 'error' ? 'bg-red-400' :
                        progress.stage === 'done'  ? 'bg-green-500' : 'bg-blue-500'
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-6 text-xs text-gray-500 flex-wrap">
                      <span>Behandlet: <strong>{progress.processed.toLocaleString('da-DK')}</strong> / {progress.total.toLocaleString('da-DK')}</span>
                      <span className="text-green-600">Matchet: <strong>{progress.matched ?? 0}</strong></span>
                      <span className="text-blue-600">Opdateret: <strong>{progress.updated}</strong></span>
                      <span className="text-orange-500">Til gennemgang: <strong>{progress.staged ?? 0}</strong></span>
                      {progress.errors > 0 && <span className="text-red-500">Fejl: <strong>{progress.errors}</strong></span>}
                    </div>
                  </div>
                )}

                {/* Resultat — fra denne session */}
                {lastImported === s.id && progress && progress.stage === 'done' && (
                  <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                    ✓ {progress.message}
                  </div>
                )}
                {lastImported === s.id && progress && progress.stage === 'error' && (
                  <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-red-700 bg-red-50 rounded px-3 py-2">
                    ✗ Fejl: {progress.message}
                  </div>
                )}

                <DuplicatesPanel supplier={s}
                  onSaved={st => setSuppliers(prev => prev.map(x => x.id === s.id ? { ...x, sync_state: st } : x))} />

                {/* Seneste kørsler — fra DB (produkter og lager hver for sig), når ingen aktiv import i denne session */}
                {lastImported !== s.id && importing !== s.id && getSummaries(s).map(sum => (
                  <div key={sum.kind ?? 'any'} className={`mt-3 first-of-type:mt-4 border-t border-gray-100 pt-3 text-xs rounded px-3 py-2 ${
                    sum.stage === 'error' ? 'text-red-600 bg-red-50' : sum.stage === 'partial' ? 'text-amber-800 bg-amber-50' : 'text-gray-500 bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                      <span className="font-medium">
                        {sum.stage === 'error' ? '✗ Seneste kørsel fejlede' : sum.stage === 'partial' ? '⏳ Kørsel i gang (opdelt)' : '✓ Seneste kørsel'}
                        <span className="font-normal text-gray-400">
                          {sum.kind && ` · ${KIND_LABEL[sum.kind]}`}
                          {sum.source && ` · ${SOURCE_LABEL[sum.source]}`}
                          {sum.test && ' · test (begrænset antal)'}
                          {sum.chunks && sum.chunks > 1 && sum.stage !== 'partial' && ` · ${sum.chunks} dele`}
                        </span>
                      </span>
                      <span className="text-gray-400">
                        {fmtTime(sum.timestamp)}
                        {fmtDuration(sum.started_at, sum.timestamp) && ` · ${fmtDuration(sum.started_at, sum.timestamp)}`}
                      </span>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      {sum.stage !== 'error' && (sum.kind === 'stock'
                        ? <span>Lager opdateret: <strong>{sum.updated}</strong></span>
                        : <>
                            <span>Matchet: <strong>{sum.matched}</strong></span>
                            <span>Opdateret: <strong>{sum.updated}</strong></span>
                            <span>Til gennemgang: <strong>{sum.staged}</strong></span>
                          </>)}
                      {sum.errors > 0 && (
                        <span className="text-red-500">
                          Fejl: <strong>{sum.errors}</strong>
                          {sum.kind !== 'stock' && Array.isArray(s.sync_state?.last_import_errors) && (s.sync_state.last_import_errors as string[]).length > 0 && (
                            <ErrorLogPopover errors={s.sync_state.last_import_errors as string[]} />
                          )}
                        </span>
                      )}
                      {sum.stage === 'error' && <span>{sum.message}</span>}
                      {sum.stage === 'partial' && (
                        <span>
                          {(sum.processed ?? 0).toLocaleString('da-DK')} af {sum.total.toLocaleString('da-DK')} varer behandlet efter {sum.chunks ?? 1} {sum.chunks === 1 ? 'del' : 'dele'}
                          {Date.now() - new Date(sum.timestamp).getTime() < 15 * 60_000
                            ? ' — næste del fortsætter automatisk'
                            : ' — stoppede før den var færdig; næste kørsel starter forfra'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {suppliers.length === 0 && (
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
              Ingen leverandører oprettet endnu
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
