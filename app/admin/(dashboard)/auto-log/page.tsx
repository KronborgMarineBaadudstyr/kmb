'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type AutoAction = {
  id:              string
  created_at:      string
  pipeline_run_id: string
  action_type:     'auto_match' | 'auto_create'
  staging_id:      string | null
  product_id:      string | null
  supplier_id:     string | null
  supplier_name:   string | null
  match_score:     number | null
  staging_name:    string
  product_name:    string
  status:          'applied' | 'reverted'
  reverted_at:     string | null
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  auto_match:  { label: 'Matchet til eksisterende', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  auto_create: { label: 'Ny oprettet',              color: 'bg-green-50 text-green-700 border-green-200' },
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtScore(n: number | null) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(0)} %`
}

export default function AutoLogPage() {
  const [rows,       setRows]       = useState<AutoAction[]>([])
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [reverting,  setReverting]  = useState<string | null>(null)

  // Filters
  const [search,  setSearch]  = useState('')
  const [type,    setType]    = useState('')
  const [status,  setStatus]  = useState('')
  const [runIds,  setRunIds]  = useState<string[]>([])
  const [runId,   setRunId]   = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      per_page: '50',
      ...(search ? { search } : {}),
      ...(type   ? { type }   : {}),
      ...(status ? { status } : {}),
      ...(runId  ? { run_id: runId } : {}),
    })
    const res  = await fetch(`/api/admin/auto-actions?${params}`)
    const json = await res.json()
    setRows(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    if (json.run_ids) setRunIds(json.run_ids)
    setLoading(false)
  }, [page, search, type, status, runId])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function handleRevert(id: string) {
    if (!confirm('Fortryd denne automatiske handling? Staging-rækken vender tilbage til "Afventer gennemgang".')) return
    setReverting(id)
    await fetch(`/api/admin/auto-actions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'revert' }),
    })
    setReverting(null)
    fetchRows()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Auto-handling log</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Automatiske pipeline-handlinger — {total.toLocaleString('da-DK')} poster i alt
        </p>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3 shrink-0 bg-gray-50">
        <input
          type="search"
          placeholder="Søg produktnavn…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={type}
          onChange={e => { setType(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="">Alle handlinger</option>
          <option value="auto_match">Matchet til eksisterende</option>
          <option value="auto_create">Ny oprettet</option>
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="">Alle statusser</option>
          <option value="applied">Aktiv</option>
          <option value="reverted">Fortrudt</option>
        </select>
        <select
          value={runId}
          onChange={e => { setRunId(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none"
        >
          <option value="">Alle pipeline-kørsler</option>
          {runIds.map(r => (
            <option key={r} value={r}>{fmtDate(r)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Indlæser…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <span className="text-3xl">📋</span>
            <p className="text-sm">Ingen handlinger fundet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-gray-200">
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Tidspunkt</th>
                <th className="px-4 py-3 font-medium">Handling</th>
                <th className="px-4 py-3 font-medium">Staging-navn</th>
                <th className="px-4 py-3 font-medium">Produkt</th>
                <th className="px-4 py-3 font-medium">Leverandør</th>
                <th className="px-4 py-3 font-medium text-center">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => {
                const typeInfo = TYPE_LABELS[row.action_type]
                const isReverted = row.status === 'reverted'
                return (
                  <tr key={row.id} className={`hover:bg-gray-50 ${isReverted ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-gray-700 text-xs line-clamp-2">{row.staging_name}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {row.product_id ? (
                        <Link
                          href={`/admin/products/${row.product_id}`}
                          className="text-blue-600 hover:underline text-xs font-medium line-clamp-2"
                        >
                          {row.product_name}
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">{row.product_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {row.supplier_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.match_score != null ? (
                        <span className={`text-xs font-mono font-medium ${
                          row.match_score >= 0.95 ? 'text-green-600' :
                          row.match_score >= 0.85 ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {fmtScore(row.match_score)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {isReverted ? (
                        <span className="text-xs text-gray-400">
                          Fortrudt {row.reverted_at ? fmtDate(row.reverted_at) : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 font-medium">Aktiv</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {row.product_id && (
                          <Link
                            href={`/admin/products/${row.product_id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Rediger
                          </Link>
                        )}
                        {!isReverted && (
                          <button
                            onClick={() => handleRevert(row.id)}
                            disabled={reverting === row.id}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40"
                          >
                            {reverting === row.id ? 'Fortryder…' : 'Fortryd'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-400">Side {page} af {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >← Forrige</button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >Næste →</button>
          </div>
        </div>
      )}
    </div>
  )
}
