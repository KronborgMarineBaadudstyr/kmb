'use client'

import { useEffect, useState, useRef } from 'react'

type Supplier = {
  id:                  string
  name:                string
  data_format:         string | null
  api_url:             string | null
  api_auth_type:       string | null
  sync_interval_hours: number
  last_synced_at:      string | null
  active:              boolean
  notes:               string | null
}

type ImportProgress = {
  stage:     'fetching' | 'importing' | 'done' | 'error'
  total:     number
  processed: number
  created:   number
  updated:   number
  errors:    number
  message:   string
}

const FORMAT_LABELS: Record<string, string> = {
  api: 'API', ftp: 'FTP', excel: 'Excel', manual: 'Manuel',
}

export default function SuppliersPage() {
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([])
  const [loading,    setLoading]    = useState(true)
  const [importing,  setImporting]  = useState<string | null>(null) // supplier id under import
  const [progress,   setProgress]   = useState<ImportProgress | null>(null)
  const [testMode,   setTestMode]   = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(j => setSuppliers(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  function startImport(supplier: Supplier) {
    if (importing) return
    if (supplier.name !== 'Engholm') {
      alert('Import er endnu kun implementeret for Engholm')
      return
    }

    setImporting(supplier.id)
    setProgress(null)

    const url = testMode
      ? '/api/import/engholm?limit=100'
      : '/api/import/engholm'

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

                <div className="flex items-center gap-3 ml-6">
                  {importing === s.id ? (
                    <button onClick={stopImport}
                      className="px-4 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                      Stop
                    </button>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
                          className="accent-blue-500" />
                        Test (100 stk.)
                      </label>
                      <button
                        onClick={() => startImport(s)}
                        disabled={!!importing}
                        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                      >
                        Importér nu
                      </button>
                    </>
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
                  <div className="flex gap-6 text-xs text-gray-500">
                    <span>Behandlet: <strong>{progress.processed.toLocaleString('da-DK')}</strong> / {progress.total.toLocaleString('da-DK')}</span>
                    <span className="text-green-600">Nye: <strong>{progress.created}</strong></span>
                    <span className="text-blue-600">Opdateret: <strong>{progress.updated}</strong></span>
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
