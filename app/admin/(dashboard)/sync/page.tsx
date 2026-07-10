'use client'

import { useState, useRef } from 'react'

type Stage = 'idle' | 'fetching' | 'importing' | 'variants' | 'done' | 'error'

type Progress = {
  stage:      Stage
  total:      number
  processed:  number
  errors:     number
  page:       number
  totalPages: number
  message:    string
}

export default function SyncPage() {
  const [progress,  setProgress]  = useState<Progress | null>(null)
  const [running,   setRunning]   = useState(false)
  const [testMode,  setTestMode]  = useState(false)
  const eventSource = useRef<EventSource | null>(null)

  function startImport() {
    if (running) return

    setRunning(true)
    setProgress(null)

    const url = testMode
      ? '/api/sync/woo-import?limit=100'
      : '/api/sync/woo-import'

    const es = new EventSource(url)
    eventSource.current = es

    es.onmessage = (e) => {
      const data: Progress = JSON.parse(e.data)
      setProgress(data)

      if (data.stage === 'done' || data.stage === 'error') {
        es.close()
        setRunning(false)
      }
    }

    es.onerror = () => {
      setProgress(p => p ? {
        ...p, stage: 'error',
        message: 'Forbindelsen til serveren blev afbrudt.',
      } : null)
      es.close()
      setRunning(false)
    }
  }

  function stopImport() {
    eventSource.current?.close()
    setRunning(false)
    setProgress(p => p ? { ...p, stage: 'idle' as Stage, message: 'Importering stoppet manuelt.' } : null)
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  const stageLabel: Record<Stage, string> = {
    idle:      'Klar',
    fetching:  'Henter data fra WooCommerce...',
    importing: 'Importerer produkter...',
    variants:  'Importerer varianter...',
    done:      'Import fuldført',
    error:     'Fejl under import',
  }

  const stageColor: Record<Stage, string> = {
    idle:      'bg-gray-200',
    fetching:  'bg-blue-500',
    importing: 'bg-blue-600',
    variants:  'bg-indigo-500',
    done:      'bg-green-500',
    error:     'bg-red-500',
  }

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Sync & Import</h2>
      <p className="text-gray-500 mb-8">Importer produkter fra WooCommerce til Supabase og hold systemer synkroniserede.</p>

      {/* WooCommerce Import sektion */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">WooCommerce → Supabase</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Henter alle produkter fra kronborgmarinebaadudstyr.dk og importerer til central database.
            </p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">37.011 produkter</span>
        </div>

        {/* Test mode toggle */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
            disabled={running}
            className="rounded"
          />
          <span className="text-sm text-gray-600">
            Test-tilstand <span className="text-gray-400">(importer kun de første 100 produkter)</span>
          </span>
        </label>

        {/* Knapper */}
        <div className="flex gap-3">
          <button
            onClick={startImport}
            disabled={running}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Importerer...' : testMode ? 'Start test import (100 prod.)' : 'Start fuld import'}
          </button>
          {running && (
            <button
              onClick={stopImport}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
            >
              Stop
            </button>
          )}
        </div>

        {/* Progress */}
        {progress && (
          <div className="mt-5">
            {/* Status label */}
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm font-medium text-gray-700">
                {stageLabel[progress.stage]}
              </span>
              {progress.total > 0 && (
                <span className="text-sm text-gray-500">{pct}%</span>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${stageColor[progress.stage]}`}
                style={{ width: `${progress.stage === 'done' ? 100 : pct}%` }}
              />
            </div>

            {/* Besked */}
            <p className="text-sm text-gray-600 mb-3">{progress.message}</p>

            {/* Stats */}
            {progress.total > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Behandlet',  value: progress.processed.toLocaleString('da-DK') },
                  { label: 'Total',      value: progress.total.toLocaleString('da-DK') },
                  { label: 'Fejl',       value: progress.errors.toLocaleString('da-DK') },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-md px-3 py-2 text-center">
                    <p className="text-lg font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Afsluttet */}
            {progress.stage === 'done' && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800 font-medium">✓ Import gennemført</p>
                <p className="text-xs text-green-600 mt-0.5">{progress.message}</p>
              </div>
            )}
            {progress.stage === 'error' && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800 font-medium">✗ Fejl under import</p>
                <p className="text-xs text-red-600 mt-0.5">{progress.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kommende integrationer */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 opacity-60">
        <h3 className="text-base font-semibold text-gray-900 mb-1">admind POS ↔ Supabase</h3>
        <p className="text-sm text-gray-500">Webhook-modtagelse og lager-sync. Implementeres når API-dokumentation foreligger.</p>
        <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Ikke konfigureret endnu</span>
      </div>
    </div>
  )
}
