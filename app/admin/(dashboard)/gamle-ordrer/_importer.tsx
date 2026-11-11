'use client'

import { useMemo, useState } from 'react'
import { parseInvoicePages, type ParsedInvoice, type TextItem } from '@/lib/old-orders/invoice-parser'
import type { InvoiceCheck } from '@/lib/old-orders/import'
import { checkAction, importAction } from './actions'

const kr = (n: number | null) => n == null ? '—' : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// PDF → tekst med placering pr. side (pdf.js i browseren; filen sendes ikke til serveren)
async function readPdf(file: File, onPage: (n: number, total: number) => void): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: TextItem[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    pages.push((tc.items as { str?: string; transform?: number[]; width?: number }[])
      .filter(i => typeof i.str === 'string' && i.transform)
      .map(i => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0 })))
    onPage(p, doc.numPages)
  }
  return pages
}

type Row = { inv: ParsedInvoice; check: InvoiceCheck | null; selected: boolean }

export function OldOrdersImporter() {
  const [rows, setRows]       = useState<Row[]>([])
  const [skipped, setSkipped] = useState<number[]>([])
  const [status, setStatus]   = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const [open, setOpen]       = useState<string | null>(null)
  const [result, setResult]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function onFile(file: File) {
    setBusy(true); setError(null); setResult(null); setRows([])
    try {
      const pages = await readPdf(file, (n, t) => setStatus(`Læser side ${n} af ${t}…`))
      const { invoices, skippedPages } = parseInvoicePages(pages)
      setSkipped(skippedPages)
      setStatus(`${invoices.length} fakturaer læst — tjekker varer og dubletter…`)
      const checks: InvoiceCheck[] = []
      for (let i = 0; i < invoices.length; i += 100) {
        const r = await checkAction(invoices.slice(i, i + 100))
        if ('error' in r) throw new Error(r.error)
        checks.push(...r)
      }
      const byInv = new Map(checks.map(c => [c.invoice, c]))
      setRows(invoices.map(inv => {
        const check = byInv.get(inv.invoice) ?? null
        return { inv, check, selected: !check?.exists && !check?.possibleDuplicate && inv.total != null }
      }))
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus(null)
    }
    setBusy(false)
  }

  async function doImport() {
    const chosen = rows.filter(r => r.selected).map(r => r.inv)
    if (!chosen.length || !confirm(`Importér ${chosen.length} ordrer?`)) return
    setBusy(true); setError(null)
    let imported = 0, skippedN = 0
    const errors: string[] = []
    for (let i = 0; i < chosen.length; i += 50) {
      setStatus(`Importerer ${Math.min(i + 50, chosen.length)} af ${chosen.length}…`)
      const r = await importAction(chosen.slice(i, i + 50))
      if ('error' in r) { errors.push(r.error); break }
      imported += r.imported; skippedN += r.skipped; errors.push(...r.errors)
    }
    setStatus(null); setBusy(false)
    setResult(`✓ ${imported} ordrer importeret${skippedN ? `, ${skippedN} fandtes allerede` : ''}.${errors.length ? ` Fejl: ${errors.join('; ')}` : ''}`)
    setRows(rs => rs.map(r => r.selected ? { ...r, selected: false, check: r.check ? { ...r.check, exists: true } : r.check } : r))
  }

  const stats = useMemo(() => {
    const lines = rows.flatMap(r => r.inv.lines)
    const matched = rows.reduce((s, r) => s + r.inv.lines.filter(l => l.sku && r.check?.matches[l.sku]).length, 0)
    return {
      orders: rows.length, selected: rows.filter(r => r.selected).length,
      withPhone: rows.filter(r => r.inv.customer.phone).length,
      exists: rows.filter(r => r.check?.exists).length, dupes: rows.filter(r => r.check?.possibleDuplicate && !r.check.exists).length,
      warnings: rows.filter(r => r.inv.warnings.some(w => !w.startsWith('Intet telefonnummer'))).length,
      lines: lines.length, matched,
      total: rows.filter(r => r.selected).reduce((s, r) => s + (r.inv.total ?? 0), 0),
    }
  }, [rows])

  const toggle = (inv: string) => setRows(rs => rs.map(r => r.inv.invoice === inv && !r.check?.exists ? { ...r, selected: !r.selected } : r))

  return (
    <div className="space-y-4">
      <label className={`block bg-white border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : 'border-gray-300 hover:border-blue-400'}`}>
        <input type="file" accept="application/pdf" className="hidden" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        <span className="text-sm text-gray-700 font-medium">Vælg PDF med salgsbilag…</span>
        <span className="block text-xs text-gray-400 mt-1">Fx Salgsbilag.pdf — alle sider på én gang</span>
      </label>

      {status && <p className="text-sm text-blue-700">{status}</p>}
      {error && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{error}</p>}
      {result && <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">{result}</p>}

      {rows.length > 0 && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 flex flex-wrap gap-x-6 gap-y-1">
            <span><strong>{stats.orders}</strong> fakturaer</span>
            <span><strong>{stats.matched}</strong> af {stats.lines} varelinjer koblet til produkter</span>
            <span><strong>{stats.withPhone}</strong> med telefonnummer (kan knyttes til kunde)</span>
            {stats.exists > 0 && <span className="text-gray-500">{stats.exists} allerede importeret</span>}
            {stats.dupes > 0 && <span className="text-amber-700">{stats.dupes} findes måske allerede (fravalgt)</span>}
            {stats.warnings > 0 && <span className="text-red-700">{stats.warnings} med advarsler</span>}
            {skipped.length > 0 && <span className="text-gray-500">Sider uden faktura: {skipped.join(', ')}</span>}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={doImport} disabled={busy || !stats.selected}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40">
              Importér {stats.selected} valgte ordrer ({kr(stats.total)} kr)
            </button>
            <button onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: !r.check?.exists })))} className="text-sm text-blue-600 hover:underline">Vælg alle</button>
            <button onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: false })))} className="text-sm text-blue-600 hover:underline">Fravælg alle</button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 w-8" />
                  <th className="text-left px-3 py-2 font-medium">Faktura</th>
                  <th className="text-left px-3 py-2 font-medium">Dato</th>
                  <th className="text-left px-3 py-2 font-medium">Kunde</th>
                  <th className="text-left px-3 py-2 font-medium">Telefon</th>
                  <th className="text-right px-3 py-2 font-medium">Varer</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ inv, check, selected }) => {
                  const matched = inv.lines.filter(l => l.sku && check?.matches[l.sku]).length
                  const realWarnings = inv.warnings.filter(w => !w.startsWith('Intet telefonnummer'))
                  return [
                    <tr key={inv.invoice} className={`${check?.exists ? 'opacity-50' : ''} hover:bg-gray-50 cursor-pointer`} onClick={() => setOpen(open === inv.invoice ? null : inv.invoice)}>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected} disabled={!!check?.exists} onChange={() => toggle(inv.invoice)} />
                      </td>
                      <td className="px-3 py-2 font-mono">{inv.invoice}{inv.pages.length > 1 && <span className="text-xs text-gray-400"> ({inv.pages.length} sider)</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(inv.date)}</td>
                      <td className="px-3 py-2">
                        {inv.customer.name ?? '—'}
                        {inv.customer.company && <span className="text-gray-400"> · {inv.customer.company}</span>}
                        <div className="text-xs text-gray-400">{[inv.customer.postcode, inv.customer.city].filter(Boolean).join(' ')}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{inv.customer.phone ?? <span className="text-gray-400" title={`Kundenr. ${inv.customer_number ?? '—'}`}>— ({inv.customer_number ?? '—'})</span>}</td>
                      <td className="px-3 py-2 text-right">{matched}/{inv.lines.length}</td>
                      <td className="px-3 py-2 text-right">{kr(inv.total)}</td>
                      <td className="px-3 py-2 text-xs">
                        {check?.exists ? <span className="text-gray-500">Allerede importeret</span>
                          : check?.possibleDuplicate ? <span className="text-amber-700" title={`${check.possibleDuplicate.source}-ordre ${check.possibleDuplicate.order_number ?? ''} ${check.possibleDuplicate.email ?? ''}`}>Findes måske ({check.possibleDuplicate.order_number ?? check.possibleDuplicate.source})</span>
                          : realWarnings.length ? <span className="text-red-700">⚠ {realWarnings[0]}</span>
                          : <span className="text-green-700">✓ Klar</span>}
                      </td>
                    </tr>,
                    open === inv.invoice && (
                      <tr key={`${inv.invoice}-d`} className="bg-gray-50">
                        <td />
                        <td colSpan={7} className="px-3 py-3 text-xs text-gray-700">
                          <div className="grid md:grid-cols-[1fr_2fr] gap-4">
                            <div>
                              <div className="font-semibold text-gray-900 mb-1">Kunde</div>
                              <div>{inv.customer.company && <>{inv.customer.company}<br /></>}{inv.customer.name}<br />{inv.customer.address}<br />{inv.customer.postcode} {inv.customer.city}</div>
                              <div className="mt-1 text-gray-500">Kundenr. {inv.customer_number ?? '—'} · {inv.order_ref ?? ''}</div>
                              {inv.shipping && <div className="mt-2">Levering: {inv.shipping.name} ({kr(inv.shipping.amount)} kr)</div>}
                              {check?.possibleDuplicate && (
                                <p className="mt-2 text-amber-800 bg-amber-50 rounded px-2 py-1">
                                  Ligner {check.possibleDuplicate.source}-ordre {check.possibleDuplicate.order_number ?? ''} fra {fmtDate(check.possibleDuplicate.ordered_at)} (samme beløb).
                                  Sæt flueben, hvis det er en anden handel.
                                </p>
                              )}
                              {inv.warnings.length > 0 && <ul className="mt-2 list-disc pl-4 text-red-700">{inv.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                            </div>
                            <table className="w-full">
                              <tbody>
                                {inv.lines.map((l, i) => {
                                  const m = l.sku ? check?.matches[l.sku] : undefined
                                  return (
                                    <tr key={i}>
                                      <td className="pr-2 py-0.5 font-mono text-gray-500">{l.sku ?? '—'}</td>
                                      <td className="pr-2 py-0.5">{l.name}{m ? <span className="text-green-700"> → {m.name} ({m.via})</span> : <span className="text-gray-400"> · ikke koblet</span>}</td>
                                      <td className="pr-2 py-0.5 text-right">{l.qty} ×</td>
                                      <td className="py-0.5 text-right">{kr(l.amount)}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
