'use client'

import { useEffect, useState, useRef } from 'react'

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
}

type ImportProgress = {
  stage:     'fetching' | 'connecting' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error'
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
}

const FORMAT_LABELS: Record<string, string> = {
  api: 'API', ftp: 'FTP', excel: 'Excel', manual: 'Manuel',
}

export default function SuppliersPage() {
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([])
  const [loading,      setLoading]      = useState(true)
  const [importing,    setImporting]    = useState<string | null>(null) // supplier id under import
  const [progress,     setProgress]     = useState<ImportProgress | null>(null)
  const [testMode,     setTestMode]     = useState(false)
  const [selectedFile, setSelectedFile] = useState<Record<string, File>>({}) // supplierId → File
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(j => setSuppliers(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

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
    if (testMode) {
      url += mode ? `?mode=${mode}&limit=20` : '?limit=100'
    } else if (mode) {
      url += `?mode=${mode}`
    }

    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      const data: ImportProgress = JSON.parse(e.data)
      setProgress(data)
      if (data.stage === 'done' || data.stage === 'error') {
        es.close()
        setImporting(null)
        // Genindlæs leverandørliste for at opdatere last_synced_at
        fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? []))
      }
    }

    es.onerror = () => {
      es.close()
      setImporting(null)
      setProgress(p => p ? { ...p, stage: 'error', message: 'Forbindelsesfejl' } : null)
    }
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

    let url = cfg.endpoint
    if (testMode) url += '?limit=100'

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
            setImporting(null)
            fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? []))
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
    setImporting(null)
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Leverandører</h2>
      <p className="text-gray-500 mb-8">Administrér leverandører og import af produktdata.</p>

      {/* Leverandørliste */}
      {loading ? (
        <div className="text-gray-400">Henter leverandører...</div>
      ) : (
        <div className="space-y-4">
          {suppliers.map(s => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
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
                    <div><span className="text-gray-400 w-28 inline-block">Sync interval</span>Hver {s.sync_interval_hours} timer</div>
                    <div>
                      <span className="text-gray-400 w-28 inline-block">Sidst synkret</span>
                      {s.last_synced_at
                        ? new Date(s.last_synced_at).toLocaleString('da-DK')
                        : <span className="text-orange-500">Aldrig</span>}
                    </div>
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
                        <label
                          className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer"
                          title="Importerer kun de første 100 produkter — til at verificere at importen virker korrekt"
                        >
                          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
                            className="accent-blue-500" />
                          Testmodus (100 stk.)
                        </label>
                      </div>
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
                        <label
                          className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer"
                          title="Importerer kun de første 100 produkter — til at verificere at importen virker korrekt"
                        >
                          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
                            className="accent-blue-500" />
                          Testmodus (100 stk.)
                        </label>
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

              {/* Progress — vises kun for aktiv import af denne leverandør */}
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

              {/* Resultat efter færdig import */}
              {importing !== s.id && progress && progress.stage === 'done' && (
                <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                  ✓ {progress.message}
                </div>
              )}
            </div>
          ))}

          {suppliers.length === 0 && (
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
              Ingen leverandører oprettet endnu
            </div>
          )}
        </div>
      )}
    </div>
  )
}
