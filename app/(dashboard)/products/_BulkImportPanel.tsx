'use client'

import { useRef, useState } from 'react'

type ImportRow = {
  row:    number
  name:   string
  status: 'created' | 'error'
  sku?:   string
  error?: string
}

export function BulkImportPanel({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone:  (count: number) => void
}) {
  const [file,     setFile]    = useState<File | null>(null)
  const [uploading,setUploading] = useState(false)
  const [results,  setResults] = useState<{ created: number; errors: number; results: ImportRow[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Kun .xlsx, .xls eller .csv filer er understøttet')
      return
    }
    setFile(f)
    setResults(null)
  }

  async function upload() {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res  = await fetch('/api/products/bulk-import', { method: 'POST', body: fd })
    const json = await res.json()
    setUploading(false)
    if (json.error) { alert(json.error); return }
    setResults(json)
  }

  const createdRows = results?.results.filter(r => r.status === 'created') ?? []
  const errorRows   = results?.results.filter(r => r.status === 'error')   ?? []

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-xl z-50 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Bulk-import fra Excel</h3>
            <p className="text-xs text-gray-400 mt-0.5">Upload .xlsx med produktdata — opretter som kladder</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Step 1: download template */}
          <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-2xl shrink-0 mt-0.5">📥</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-900">Trin 1 — Download skabelon</p>
              <p className="text-xs text-blue-700 mt-0.5">Brug den officielle skabelon for korrekt kolonne-rækkefølge. Vejledning er inkluderet som separat fane.</p>
              <a href="/api/products/bulk-import" download="produktimport-skabelon.xlsx"
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                📄 Download skabelon (.xlsx)
              </a>
            </div>
          </div>

          {/* Step 2: upload */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Trin 2 — Udfyld og upload</p>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => inputRef.current?.click()}
              className={`relative cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-50' :
                file      ? 'border-green-300 bg-green-50' :
                            'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {file ? (
                <div>
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm font-medium text-green-700">{file.name}</p>
                  <p className="text-xs text-green-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB — klik for at skifte fil</p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-2 text-gray-300">📂</p>
                  <p className="text-sm text-gray-500">Træk fil hertil eller <span className="text-blue-600 hover:underline">klik for at vælge</span></p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx, .xls eller .csv</p>
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{results.created}</p>
                  <p className="text-xs text-green-600 mt-0.5">Oprettet</p>
                </div>
                {results.errors > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{results.errors}</p>
                    <p className="text-xs text-red-600 mt-0.5">Fejlede</p>
                  </div>
                )}
              </div>

              {/* Detail rows */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultat pr. række</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {createdRows.map(r => (
                    <div key={r.row} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-green-500 shrink-0">✓</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">{r.name}</span>
                      <span className="font-mono text-xs text-gray-400 shrink-0">{r.sku}</span>
                    </div>
                  ))}
                  {errorRows.map(r => (
                    <div key={r.row} className="flex items-start gap-3 px-4 py-2.5 bg-red-50">
                      <span className="text-red-500 shrink-0 mt-0.5">✕</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{r.name || `Række ${r.row}`}</p>
                        <p className="text-xs text-red-600 mt-0.5">{r.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0 bg-white">
          {!results ? (
            <>
              <button onClick={upload} disabled={!file || uploading}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {uploading ? 'Importerer...' : 'Importer produkter'}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                Annuller
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { onDone(results.created); onClose() }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
                {results.created > 0 ? `Se ${results.created} oprettede produkter` : 'Luk'}
              </button>
              <button onClick={() => { setFile(null); setResults(null) }}
                className="px-4 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                Importer flere
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
