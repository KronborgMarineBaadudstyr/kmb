'use client'

import { useMemo, useState } from 'react'
import { parsePosCsv, type PosParseResult, type PosReceipt } from '@/lib/old-orders/pos-parser'
import type { PosMatch } from '@/lib/old-orders/pos-import'
import { matchPosAction, importPosAction } from './pos-actions'

// Kassesalg (løssalg) fra det gamle kassesystem: CSV/TXT, evt. delt i flere filer. Læses i browseren.
const fmt = (n: number) => n.toLocaleString('da-DK')
const kr  = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr'
const day = (s: string | null) => s ? new Date(`${s}:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Ugyldig UTF-8 (fx Windows-1252 fra ældre systemer) → prøv igen
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export function PosImporter() {
  const [parsed, setParsed]   = useState<PosParseResult | null>(null)
  const [files, setFiles]     = useState<string[]>([])
  const [matches, setMatches] = useState<Record<string, PosMatch>>({})
  const [staged, setStaged]   = useState<Record<string, string>>({})
  const [update, setUpdate]   = useState(true)
  const [withInvoices, setWithInvoices] = useState(true)
  const [status, setStatus]   = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [result, setResult]   = useState<string | null>(null)

  async function onFiles(list: FileList) {
    setBusy(true); setError(null); setResult(null); setParsed(null); setMatches({}); setStaged({})
    try {
      // Filen med overskriftslinjen først (første halvdel), resten i navneorden
      const all = [...list].sort((a, b) => a.name.localeCompare(b.name, 'da', { numeric: true }))
      setStatus(`Læser ${all.length} fil(er)…`)
      const texts = await Promise.all(all.map(readText))
      const order = texts.map((t, i) => ({ t, i, hasHeader: t.slice(0, 200).includes('"EntryNo"') || t.startsWith('EntryNo') }))
        .sort((a, b) => Number(b.hasHeader) - Number(a.hasHeader) || a.i - b.i)
      if (!order[0].hasHeader) throw new Error('Ingen af filerne har overskriftslinjen ("EntryNo";"CustNo";…). Vælg også den første del af udtrækket.')
      const res = parsePosCsv(order.map(o => o.t))
      setFiles(order.map(o => all[o.i].name))
      setParsed(res)

      // Find vores produkter for alle kassens varenumre
      const items = new Map<string, string | null>()
      for (const r of res.receipts) for (const l of r.lines) if (!items.has(l.item_no)) items.set(l.item_no, l.group)
      const list2 = [...items].map(([item_no, group]) => ({ item_no, group }))
      const found: Record<string, PosMatch> = {}
      const inStaging: Record<string, string> = {}
      for (let i = 0; i < list2.length; i += 2000) {
        setStatus(`Finder varer i jeres katalog… ${fmt(Math.min(i + 2000, list2.length))} af ${fmt(list2.length)} varenumre`)
        const r = await matchPosAction(list2.slice(i, i + 2000))
        if ('error' in r) throw new Error(r.error)
        Object.assign(found, r.matches); Object.assign(inStaging, r.staged)
      }
      setMatches(found); setStaged(inStaging)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus(null)
    }
    setBusy(false)
  }

  const chosen = useMemo<PosReceipt[]>(() => (parsed?.receipts ?? []).filter(r => withInvoices || r.doc_type === 'receipt'), [parsed, withInvoices])

  const stats = useMemo(() => {
    if (!parsed) return null
    const lines = chosen.flatMap(r => r.lines)
    const matchedLines = lines.filter(l => matches[l.item_no]).length
    const groups = new Map<string, { lines: number; matched: number; revenue: number }>()
    const unmatched = new Map<string, { name: string; group: string | null; lines: number; revenue: number }>()
    const notCreated = new Map<string, number>()      // leverandør → linjer med varer der ikke er oprettet
    for (const l of lines) {
      const g = l.group ?? '—'
      const s = groups.get(g) ?? { lines: 0, matched: 0, revenue: 0 }
      s.lines++; s.revenue += l.amount; if (matches[l.item_no]) s.matched++
      groups.set(g, s)
      if (!matches[l.item_no] && staged[l.item_no]) notCreated.set(staged[l.item_no], (notCreated.get(staged[l.item_no]) ?? 0) + 1)
      if (!matches[l.item_no]) {
        const u = unmatched.get(l.item_no) ?? { name: l.name, group: l.group, lines: 0, revenue: 0 }
        u.lines++; u.revenue += l.amount
        unmatched.set(l.item_no, u)
      }
    }
    return {
      receipts: chosen.length, lines: lines.length, matchedLines,
      revenue: chosen.reduce((s, r) => s + r.total, 0),
      withPhone: chosen.filter(r => r.phone).length,
      multi: chosen.filter(r => r.lines.length > 1).length,
      types: { receipt: chosen.filter(r => r.doc_type === 'receipt').length, invoice: chosen.filter(r => r.doc_type === 'invoice').length, credit: chosen.filter(r => r.doc_type === 'credit').length },
      groups: [...groups].sort((a, b) => b[1].lines - a[1].lines).slice(0, 15),
      notCreated: [...notCreated].sort((a, b) => b[1] - a[1]),
      unmatched: [...unmatched].sort((a, b) => b[1].lines - a[1].lines).slice(0, 20),
    }
  }, [parsed, chosen, matches, staged])

  async function doImport() {
    if (!chosen.length || !confirm(`Importér ${fmt(chosen.length)} bonner som kassesalg?`)) return
    setBusy(true); setError(null); setResult(null); setProgress(0)
    let imported = 0, updated = 0, skipped = 0
    const errors: string[] = []
    const BATCH = 800
    for (let i = 0; i < chosen.length; i += BATCH) {
      const part = chosen.slice(i, i + BATCH)
      const m: Record<string, { product_id: string; variant_id: string | null }> = {}
      for (const r of part) for (const l of r.lines) { const x = matches[l.item_no]; if (x) m[l.item_no] = { product_id: x.product_id, variant_id: x.variant_id } }
      setStatus(`Importerer ${fmt(Math.min(i + BATCH, chosen.length))} af ${fmt(chosen.length)} bonner…`)
      const r = await importPosAction(part, m, update)
      if ('error' in r) { errors.push(r.error); break }
      imported += r.imported; updated += r.updated; skipped += r.skipped
      if (r.errors.length) { errors.push(...r.errors); if (errors.length > 5) break }
      setProgress(Math.round(((i + part.length) / chosen.length) * 100))
    }
    setBusy(false); setStatus(null); setProgress(null)
    setResult(`✓ ${fmt(imported)} bonner importeret${updated ? `, ${fmt(updated)} opdateret med nye koblinger` : ''}${skipped ? `, ${fmt(skipped)} fandtes allerede` : ''}.${errors.length ? ` Fejl: ${errors.slice(0, 3).join('; ')}` : ''}`)
  }

  return (
    <div className="space-y-4">
      <label className={`block bg-white border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : 'border-gray-300 hover:border-blue-400'}`}>
        <input type="file" multiple accept=".txt,.csv,text/plain,text/csv" className="hidden" disabled={busy}
          onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
        <span className="text-sm text-gray-700 font-medium">Vælg kassens salgsfil(er)…</span>
        <span className="block text-xs text-gray-400 mt-1">Fx Salg_Kronborg-txt11.txt + Salg_Kronborg-txt2.txt — vælg alle dele på én gang</span>
      </label>

      {status && <p className="text-sm text-blue-700">{status}</p>}
      {progress != null && <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} /></div>}
      {error && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{error}</p>}
      {result && <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">{result}</p>}

      {parsed && stats && !status && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2">
            <p className="text-xs text-gray-400">{files.join(' + ')} · {fmt(parsed.rows)} rækker{parsed.badRows ? ` · ${fmt(parsed.badRows)} kunne ikke læses` : ''}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><strong>{fmt(stats.receipts)}</strong> bonner ({day(parsed.from)} – {day(parsed.to)})</span>
              <span><strong>{fmt(stats.lines)}</strong> varelinjer · {kr(stats.revenue)}</span>
              <span><strong>{fmt(stats.multi)}</strong> bonner med flere varer (grundlag for &quot;købes sammen&quot;)</span>
              <span><strong>{fmt(stats.withPhone)}</strong> med kundens telefonnummer</span>
            </div>
            <p>
              <strong>{fmt(stats.matchedLines)}</strong> af {fmt(stats.lines)} varelinjer ({stats.lines ? Math.round(stats.matchedLines / stats.lines * 100) : 0} %) er koblet til jeres produkter.
              <span className="text-gray-500"> Kun koblede linjer tæller i salgsanalysen — resten gemmes med navn og beløb.</span>
            </p>
            {stats.notCreated.length > 0 && (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {fmt(stats.notCreated.reduce((s, [, n]) => s + n, 0))} ukoblede varelinjer er varer, der findes hos jeres leverandører, men ikke er oprettet som produkter endnu
                ({stats.notCreated.map(([sup, n]) => `${sup}: ${fmt(n)}`).join(', ')}). Opret dem under <a href="/admin/staging" className="underline">Nye varer</a>, og importér
                filerne igen — så bliver bonnerne opdateret med de nye koblinger.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={update} onChange={e => setUpdate(e.target.checked)} />
              Opdatér koblinger på bonner, der allerede er importeret
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withInvoices} onChange={e => setWithInvoices(e.target.checked)} />
              Medtag kassens fakturaer og kreditnotaer ({fmt(parsed.receipts.filter(r => r.doc_type === 'invoice').length)} FAK / {fmt(parsed.receipts.filter(r => r.doc_type === 'credit').length)} KRE)
            </label>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">Varegrupper i kassen</h3>
              <table className="w-full text-sm tabular-nums">
                <tbody className="divide-y divide-gray-50">
                  {stats.groups.map(([g, s]) => (
                    <tr key={g}>
                      <td className="px-4 py-1.5">{g}</td>
                      <td className="px-4 py-1.5 text-right text-gray-500">{fmt(s.lines)} linjer</td>
                      <td className={`px-4 py-1.5 text-right ${s.matched / s.lines > 0.6 ? 'text-green-700' : s.matched / s.lines > 0.2 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {Math.round(s.matched / s.lines * 100)} % koblet
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">Mest solgte varer uden kobling</h3>
              <table className="w-full text-sm tabular-nums">
                <tbody className="divide-y divide-gray-50">
                  {stats.unmatched.map(([item, u]) => (
                    <tr key={item}>
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-500">{item}</td>
                      <td className="px-4 py-1.5">{u.name}<span className="text-xs text-gray-400"> · {u.group ?? '—'}</span>
                        {staged[item] && <span className="ml-1.5 text-[11px] text-amber-700">ikke oprettet ({staged[item]})</span>}</td>
                      <td className="px-4 py-1.5 text-right text-gray-500">{fmt(u.lines)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <button onClick={doImport} disabled={busy || !stats.receipts}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40">
            Importér {fmt(stats.receipts)} bonner som kassesalg
          </button>
          <p className="text-xs text-gray-500">
            Bonnerne gemmes som afsluttede kassesalg med dato og tid — de påvirker ikke lageret og sender ingen mails.
            Samme bon importeres aldrig to gange, så du kan trygt importere et nyere udtræk senere — eller de samme filer igen,
            når flere varer er oprettet som produkter (koblingerne opdateres, hvis fluebenet er sat).
          </p>
        </>
      )}
    </div>
  )
}
