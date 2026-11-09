'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { classifyWord, canonicalValue, type VariantAttributeDef } from '@/lib/variant-attributes'
import { ImportFlow } from '../_import-flow'

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
  create_as?:         'same' | 'variants' | null                  // migration 064
  member_attributes?: Record<string, VariantAttr[]> | null
}

type GroupPatch = {
  suggested_name?: string; status?: string; bad_ean_supplier_ids?: string[]; member_ids?: string[]
  create_as?: 'same' | 'variants'; member_attributes?: Record<string, VariantAttr[]>
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
  high:   { label: 'Sikker',     color: 'bg-green-100 text-green-700 border-green-200' },
  medium: { label: 'Tjek efter', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:    { label: 'Usikker',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review:  { label: 'Afventer',         color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  confirmed:       { label: 'Bekræftet',        color: 'bg-blue-50 text-blue-700 border-blue-200'       },
  rejected:        { label: 'Afvist',           color: 'bg-gray-100 text-gray-500 border-gray-200'      },
  product_created: { label: 'Produkt oprettet', color: 'bg-green-50 text-green-700 border-green-200'    },
}

// ── Varianter: gæt egenskaber ud fra leverandørdata eller forskellen i navnene ──
type VariantAttr = { name: string; value: string }

const COLOR_RE = /^(rød|røde|rødt|blå|blåt|grøn|grønt|sort|sorte|hvid|hvide|hvidt|gul|gule|grå|brun|orange|lilla|pink|rosa|beige|navy|turkis|sølv|guld|red|blue|green|black|white|yellow|grey|gray|brown|silver|gold|marineblå|mørkeblå|lyseblå)$/i
const SIZE_RE  = /\d|^(xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large|lille|stor|mini|maxi)$/i

function inferVariantSetup(members: MatchMember[], defs: VariantAttributeDef[] = []): { names: string[]; values: Record<string, Record<string, string>>; base: string } {
  const values: Record<string, Record<string, string>> = {}
  const order = (n: string) => { const i = defs.findIndex(d => d.name.toLowerCase() === n.toLowerCase()); return i < 0 ? 999 : i }

  // 1) Leverandørens egne variant-egenskaber (Palby, Kap-Horn) — værdier oversat til fælles stavemåde
  const names: string[] = []
  for (const m of members) {
    const attrs = m.raw_data.supplier_variant_attributes
    if (!Array.isArray(attrs)) continue
    for (const a of attrs as { name?: unknown; value?: unknown }[]) {
      if (typeof a?.name !== 'string' || typeof a?.value !== 'string' || !a.name.trim()) continue
      const raw = a.name.trim()
      const n = defs.find(d => d.name.toLowerCase() === raw.toLowerCase())?.name ?? raw
      if (!names.includes(n)) names.push(n)
      ;(values[m.id] ??= {})[n] = canonicalValue(n, a.value.trim(), defs)
    }
  }

  // 2) Fælles ord i navnene = produktnavnet; resten = det der adskiller varianterne.
  //    "10 mm" samles til "10mm", så tal med enhed genkendes.
  const units = new Set(['mm', 'cm', 'm', 'l', 'ml', 'kg', 'g', 'v', 'w', 'a', 'ah', ...defs.map(d => d.unit?.toLowerCase()).filter((u): u is string => !!u)])
  const split = (name: string) => {
    const out: string[] = []
    for (const w of name.split(/\s+/).filter(Boolean)) {
      const prev = out[out.length - 1]
      if (prev && /^\d+([.,]\d+)?$/.test(prev) && units.has(w.toLowerCase())) out[out.length - 1] = prev + w
      else out.push(w)
    }
    return out
  }
  const tokens = members.map(m => split(m.normalized_name ?? ''))
  const lower  = tokens.map(t => t.map(w => w.toLowerCase()))
  const common = (tokens[0] ?? []).filter((w, i) => lower.every(l => l.includes(lower[0][i])))
  const commonSet = new Set(common.map(w => w.toLowerCase()))
  const base = common.join(' ')

  if (names.length === 0) {
    // Hvert ord der adskiller sig: først de fælles egenskaber (værdier, synonymer, enheder), ellers Farve/Størrelse/Variant
    const fallback = (w: string) => COLOR_RE.test(w) ? 'Farve' : SIZE_RE.test(w) ? 'Størrelse' : 'Variant'
    const used = new Set<string>()
    members.forEach((m, i) => {
      const byKind: Record<string, string[]> = {}
      for (const w of tokens[i]) {
        if (commonSet.has(w.toLowerCase())) continue
        const hit = classifyWord(w, defs)
        const k = hit?.name ?? fallback(w)
        ;(byKind[k] ??= []).push(hit?.value ?? canonicalValue(k, w, defs))
      }
      for (const [k, ws] of Object.entries(byKind)) { used.add(k); (values[m.id] ??= {})[k] = ws.join(' ') }
    })
    for (const k of [...used].sort((a, b) => order(a) - order(b) || ['Størrelse', 'Farve', 'Variant'].indexOf(a) - ['Størrelse', 'Farve', 'Variant'].indexOf(b))) names.push(k)
  }
  if (names.length === 0) names.push(defs[0]?.name ?? 'Variant')
  return { names, values, base }
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
  { key: 'all',       label: 'Alle forslag',            status: 'pending_review' },
  { key: 'high',      label: 'Samme EAN',               status: 'pending_review', confidence: 'high'   },
  { key: 'medium',    label: 'Lignende navn',           status: 'pending_review', confidence: 'medium' },
  { key: 'variant',   label: 'Varianter',               status: 'pending_review', method: 'variant,parent_sku' },
  { key: 'confirmed', label: 'Bekræftet',               status: 'confirmed'      },
  { key: 'rejected',  label: 'Afvist',                  status: 'rejected'       },
]

// ── Group Card ──
function GroupCard({
  group,
  onUpdate,
  attrDefs,
}: {
  group:    MatchGroup
  onUpdate: (id: string, patch: GroupPatch) => Promise<string | null>
  attrDefs: VariantAttributeDef[]     // fælles variant-egenskaber (Sortiment)
}) {
  const [editName,        setEditName]        = useState(() => {
    // Variant-grupper: start med det fælles navn (uden størrelse/farve), hvis forslaget bare er én af varernes navne
    const variantDefault = group.create_as === 'variants' || (!group.create_as && (group.match_method === 'variant' || group.match_method === 'parent_sku'))
    const base = variantDefault && group.members.length > 1 ? inferVariantSetup(group.members, attrDefs).base : ''
    const s = group.suggested_name ?? ''
    return base && (!s.trim() || group.members.some(m => m.normalized_name === s)) ? base : s
  })
  const [loading,         setLoading]         = useState(false)
  const [msg,             setMsg]             = useState<string | null>(null)
  // I variant-tilstand viser egenskabstabellen varerne — detaljelisten starter derfor foldet sammen
  const [showMembers,     setShowMembers]     = useState(() =>
    !(group.members.length > 1 && (group.create_as === 'variants' || (!group.create_as && (group.match_method === 'variant' || group.match_method === 'parent_sku')))))
  const [detailMember,    setDetailMember]    = useState<MatchMember | null>(null)
  const [rejectMode,      setRejectMode]      = useState(false)
  const [badEanSuppliers, setBadEanSuppliers] = useState<Set<string>>(new Set())
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(
    () => new Set(group.members.map(m => m.id))
  )

  // Samme vare (ét produkt, flere leverandører) eller varianter (ét produkt, flere udgaver)
  const [mode, setMode] = useState<'same' | 'variants'>(
    () => group.create_as ?? (group.match_method === 'variant' || group.match_method === 'parent_sku' ? 'variants' : 'same'))
  const setup = useMemo(() => inferVariantSetup(group.members, attrDefs), [group.members, attrDefs])
  const [attrNames,  setAttrNames]  = useState<string[]>(() => setup.names)
  const [attrValues, setAttrValues] = useState<Record<string, Record<string, string>>>(() => setup.values)
  const selectedMembers = group.members.filter(m => selectedIds.has(m.id))

  function chooseMode(next: 'same' | 'variants') {
    setMode(next)
    // Produktnavnet for varianter er det fælles navn (uden størrelse/farve)
    if (next === 'variants' && setup.base && (!editName.trim() || group.members.some(m => m.normalized_name === editName))) {
      setEditName(setup.base)
    }
  }
  const memberAttrs = (id: string): VariantAttr[] =>
    attrNames.map(n => ({ name: n.trim(), value: (attrValues[id]?.[n] ?? '').trim() })).filter(a => a.name && a.value)
  const attrKey = (id: string) => JSON.stringify(memberAttrs(id).map(a => [a.name.toLowerCase(), a.value.toLowerCase()]).sort())
  const missingAttrs  = selectedMembers.filter(m => memberAttrs(m.id).length === 0)
  const variantCount  = new Set(selectedMembers.map(m => attrKey(m.id))).size
  const sameSupplierDupes = selectedMembers.some((m, i) =>
    selectedMembers.some((o, j) => j > i && o.supplier_id === m.supplier_id && attrKey(o.id) === attrKey(m.id)))

  const conf     = CONFIDENCE_LABELS[group.match_confidence] ?? CONFIDENCE_LABELS.low
  const isSingle = group.match_method === 'single'
  const isEan    = group.match_method === 'ean'

  async function handleConfirm() {
    if (selectedIds.size === 0) { setMsg('Vælg mindst ét produkt'); return }
    if (mode === 'variants') {
      if (!editName.trim()) { setMsg('Skriv produktnavnet (fælles for alle varianter)'); return }
      if (missingAttrs.length > 0) { setMsg('Udfyld mindst én egenskab for hver variant'); return }
    }
    setLoading(true)
    setMsg(null)
    const err = await onUpdate(group.id, {
      status:        'confirmed',
      suggested_name: editName,
      member_ids:    [...selectedIds],
      create_as:     group.members.length > 1 ? mode : undefined,
      member_attributes: mode === 'variants'
        ? Object.fromEntries(selectedMembers.map(m => [m.id, memberAttrs(m.id)]))
        : undefined,
    })
    if (err) { setMsg(`Fejl: ${err}`); setLoading(false); return }
    setMsg(mode === 'variants' ? `Bekræftet — oprettes som ét produkt med ${variantCount} varianter` : 'Bekræftet')
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
                  Samme EAN
                </span>
              )}
              {group.match_method === 'fuzzy_name' && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                  Lignende navn
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

            {/* Samme vare eller varianter? */}
            {!isActioned && group.members.length > 1 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1.5">Hvordan hører varerne sammen?</p>
                <div className="grid sm:grid-cols-2 gap-2" role="radiogroup">
                  {([
                    ['same',     '🟰 Samme vare',  'Præcis den samme vare — bare fra flere leverandører. Bliver til ét produkt.'],
                    ['variants', '🔀 Varianter',   'Samme produkt i forskellige udgaver (fx størrelse eller farve). Bliver til ét produkt, hvor kunden vælger variant.'],
                  ] as const).map(([value, title, text]) => (
                    <button key={value} type="button" role="radio" aria-checked={mode === value}
                      onClick={() => chooseMode(value)}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                        mode === value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className="block text-sm font-medium text-gray-900">{title}</span>
                      <span className="block text-xs text-gray-500 leading-snug">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Foreslået navn — editable */}
            {!isActioned && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">
                  {mode === 'variants' && group.members.length > 1 ? 'Produktnavn (fælles for alle varianter — uden størrelse/farve)' : 'Foreslået produktnavn'}
                </label>
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
                {!isActioned && group.members.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 pb-1 border-b border-gray-100">
                    <span>Afkryds produkter der skal samles i denne gruppe</span>
                    <button
                      className="ml-auto text-blue-500 hover:underline"
                      onClick={() => setSelectedIds(new Set(group.members.map(m => m.id)))}
                    >Vælg alle</button>
                  </div>
                )}
                {group.members.map(m => {
                  const pp       = m.raw_data.purchase_price
                  const qty      = Number(m.raw_data.supplier_stock_quantity ?? 0)
                  const hasImages = ((m.raw_data.supplier_images as SupplierImage[] | undefined) ?? []).length > 0
                  const checked  = selectedIds.has(m.id)
                  return (
                    <div key={m.id} className={`flex gap-2 items-start rounded-lg border transition-colors ${
                      !isActioned
                        ? checked
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-gray-50/40 border-dashed border-gray-200 opacity-50'
                        : 'bg-gray-50 border-transparent'
                    }`}>
                      {!isActioned && group.members.length > 1 && (
                        <div className="pt-3 pl-3 shrink-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setSelectedIds(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.add(m.id) : next.delete(m.id)
                              return next
                            })}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </div>
                      )}
                      <button
                        onClick={() => setDetailMember(m)}
                        className="flex-1 text-left px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1 group cursor-pointer"
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
                    </div>
                  )
                })}
                {!isActioned && selectedIds.size < group.members.length && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    {group.members.length - selectedIds.size} vare(r) uden flueben tages ud af gruppen og havner under Nye varer
                  </p>
                )}
              </div>
            )}

            {/* Varianter: hvad adskiller dem? */}
            {!isActioned && mode === 'variants' && group.members.length > 1 && selectedMembers.length > 0 && (
              <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-medium">Hvad adskiller varianterne?</span> Angiv egenskaben (fx Størrelse, Farve) og værdien for hver vare.
                  Varer med samme værdier — fx samme størrelse fra to leverandører — bliver til én variant med flere leverandører.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-white">
                        <th className="text-left font-medium text-gray-500 px-3 py-2">Vare</th>
                        {attrNames.map((n, i) => (
                          <th key={i} className="px-2 py-1.5 font-normal min-w-[8rem]">
                            <div className="flex items-center gap-1">
                              <input value={n} placeholder="Egenskab" aria-label="Navn på egenskab" list={`attr-names-${group.id}`}
                                onChange={e => {
                                  const v = e.target.value
                                  setAttrNames(prev => prev.map((x, j) => j === i ? v : x))
                                  setAttrValues(prev => Object.fromEntries(Object.entries(prev).map(([id, vals]) => {
                                    const { [n]: old, ...rest } = vals
                                    return [id, old !== undefined ? { ...rest, [v]: old } : rest]
                                  })))
                                }}
                                className="w-full px-2 py-1 font-medium text-gray-800 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              {attrNames.length > 1 && (
                                <button type="button" title="Fjern egenskab" className="text-gray-400 hover:text-red-600 px-1"
                                  onClick={() => setAttrNames(prev => prev.filter((_, j) => j !== i))}>×</button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="px-2 py-1.5 w-px">
                          {attrNames.length < 4 && (
                            <button type="button" className="whitespace-nowrap text-blue-600 hover:underline"
                              onClick={() => setAttrNames(prev => [...prev, !prev.includes('Farve') ? 'Farve' : !prev.includes('Størrelse') ? 'Størrelse' : `Egenskab ${prev.length + 1}`])}>
                              + Egenskab
                            </button>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedMembers.map(m => {
                        const missing = memberAttrs(m.id).length === 0
                        return (
                          <tr key={m.id} className={missing ? 'bg-red-50/50' : ''}>
                            <td className="px-3 py-1.5">
                              <div className="text-gray-800">{m.normalized_name}</div>
                              <div className="text-gray-400">{m.suppliers?.name ?? '—'} · {m.normalized_sku}</div>
                            </td>
                            {attrNames.map((n, i) => (
                              <td key={i} className="px-2 py-1.5">
                                <input value={attrValues[m.id]?.[n] ?? ''} placeholder={missing && i === 0 ? 'Mangler' : ''}
                                  list={`attr-values-${group.id}-${i}`}
                                  onBlur={e => {
                                    // Synonymer oversættes til den fælles stavemåde ("navy" → "Marineblå")
                                    const v = canonicalValue(n, e.target.value, attrDefs)
                                    if (v !== e.target.value) setAttrValues(prev => ({ ...prev, [m.id]: { ...prev[m.id], [n]: v } }))
                                  }}
                                  aria-label={`${n || 'Egenskab'} for ${m.normalized_name}`}
                                  onChange={e => {
                                    const v = e.target.value
                                    setAttrValues(prev => ({ ...prev, [m.id]: { ...prev[m.id], [n]: v } }))
                                  }}
                                  className={`w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    missing ? 'border-red-300' : 'border-gray-200'}`} />
                              </td>
                            ))}
                            <td />
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <datalist id={`attr-names-${group.id}`}>
                    {attrDefs.map(d => <option key={d.id} value={d.name} />)}
                  </datalist>
                  {attrNames.map((n, i) => (
                    <datalist key={i} id={`attr-values-${group.id}-${i}`}>
                      {(attrDefs.find(d => d.name.toLowerCase() === n.trim().toLowerCase())?.values ?? []).map(v => <option key={v.value} value={v.value} />)}
                    </datalist>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-gray-100 text-xs flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-gray-600">Bliver til <strong>{variantCount}</strong> {variantCount === 1 ? 'variant' : 'varianter'}</span>
                  {missingAttrs.length > 0 && <span className="text-red-600">{missingAttrs.length} vare(r) mangler en værdi</span>}
                  {sameSupplierDupes && <span className="text-amber-700">⚠ To varer fra samme leverandør har samme værdier — er det virkelig samme variant?</span>}
                </div>
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
                  {mode === 'variants' && group.members.length > 1
                    ? `✅ Bekræft — ét produkt med ${variantCount} ${variantCount === 1 ? 'variant' : 'varianter'}`
                    : '✅ Bekræft — samme vare'}
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

            {group.status === 'confirmed' && !group.product_id && (
              <div className="mt-3 text-xs text-blue-700 bg-blue-50 rounded px-3 py-2">
                {group.create_as === 'variants' || (!group.create_as && (group.match_method === 'variant' || group.match_method === 'parent_sku'))
                  ? 'Oprettes som ét produkt med varianter'
                  : 'Oprettes som ét produkt med flere leverandører'} næste gang pipelinen kører (&quot;Kør igen&quot; øverst).
              </div>
            )}

            {group.product_id && (
              <a
                href={`/admin/products/${group.product_id}`}
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

const COLLAPSE_KEY = 'kmb_matching_pipeline_collapsed'

const PIPELINE_STAGES = [
  { key: 'categories',   label: '1 · Kategorier',        icon: '🗂' },
  { key: 'matching',     label: '2 · Matching',           icon: '🔗' },
  { key: 'auto_confirm', label: '3 · Auto-bekræft',       icon: '✅' },
  { key: 'auto_create',  label: '4 · Opret produkter',    icon: '📦' },
  { key: 'remap',        label: '5 · Kategorisér',        icon: '🏷️' },
  { key: 'suggestions',  label: '6 · Match-forslag',      icon: '💡' },
  { key: 'auto_stage',   label: '7 · Auto-behandling',    icon: '🤖' },
]

// ── Pipeline Panel ──
function PipelinePanel({ onDone }: { onDone: () => void }) {
  const [steps,    setSteps]    = useState<Record<string, PipelineStep>>({})
  const [running,  setRunning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [summary,  setSummary]  = useState<Record<string, number> | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [loopIteration, setLoopIteration] = useState(0)
  const esRef      = useRef<EventSource | null>(null)
  const retryRef   = useRef(0)
  const runIdRef   = useRef<string | null>(null)
  const loopRef    = useRef(0)   // tracks current auto-loop iteration
  const totalSummaryRef = useRef<Record<string, number>>({})  // accumulated totals across loops

  // Panelet kan minimeres til én linje, så listen får pladsen. Valget huskes i browseren.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { /* ingen storage */ }
  }, [])
  function toggleCollapsed() {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ingen storage */ }
      return !c
    })
  }

  // Hent seneste kørsel ved mount
  useEffect(() => {
    fetch('/api/pipeline/status')
      .then(r => r.json())
      .then(j => {
        const run = j.data
        if (!run) return
        setLastRunAt(run.started_at)
        if (run.status === 'running') {
          // Pipeline kørte stadig — genopret SSE-forbindelse
          setRunning(true)
          runIdRef.current = run.id
          retryRef.current = 0
          connectToEndpoint('/api/pipeline/create-products?run_id=' + run.id, {})
        } else if (run.status === 'done') {
          setDone(true)
          setSummary(run.summary ?? {})
          // Gendan trin-status fra DB
          const dbSteps: Record<string, PipelineStep> = {}
          for (const [key, val] of Object.entries(run.steps ?? {})) {
            dbSteps[key] = val as PipelineStep
          }
          setSteps(dbSteps)
        } else if (run.status === 'error') {
          setError(run.error ?? 'Ukendt fejl')
          const dbSteps: Record<string, PipelineStep> = {}
          for (const [key, val] of Object.entries(run.steps ?? {})) {
            dbSteps[key] = val as PipelineStep
          }
          setSteps(dbSteps)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function connectToEndpoint(url: string, summaryRef: Record<string, number>) {
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e: MessageEvent<string>) => {
      const ev = JSON.parse(e.data) as Record<string, unknown>
      const stage = ev.stage as string

      // Gem run_id fra /run så vi kan sende den videre til create-products
      if (stage === 'run_id') {
        runIdRef.current = ev.run_id as string
        return
      }

      if (stage === 'done') {
        es.close()
        // Merge partial summary
        const partial = ev.summary as Record<string, number> | undefined
        if (partial) Object.assign(summaryRef, partial)

        if (url.includes('create-products')) {
          // Accumulate totals
          for (const [k, v] of Object.entries(summaryRef)) {
            totalSummaryRef.current[k] = (totalSummaryRef.current[k] ?? 0) + (v as number)
          }
          const remaining = summaryRef.remaining ?? 0
          if (remaining > 0) {
            // Auto-restart: der er stadig produkter at køre
            loopRef.current += 1
            setLoopIteration(loopRef.current)
            setSteps({})
            runIdRef.current = null
            retryRef.current = 0
            connectToEndpoint('/api/pipeline/run', {})
          } else {
            // Fully done
            setSummary({ ...totalSummaryRef.current })
            setDone(true)
            setRunning(false)
            onDone()
          }
        } else {
          // /run finished — start /create-products med run_id
          retryRef.current = 0
          const cpUrl = runIdRef.current
            ? `/api/pipeline/create-products?run_id=${runIdRef.current}`
            : '/api/pipeline/create-products'
          connectToEndpoint(cpUrl, summaryRef)
        }
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
        if (ev.updated != null)        detail = `${ev.updated} kategorier opdateret`
        if (ev.confirmed != null)      detail = `${ev.confirmed} bekræftet`
        if (ev.created != null && stage !== 'auto_stage') detail = `${ev.created} produkter oprettet`
        if (ev.groups_created != null) detail = `${ev.groups_created} grupper oprettet`
        if (ev.populated != null)      detail = `${ev.populated} forslag tilføjet`
        if (ev.processed != null)      detail = `${ev.processed} kategoriseret`
        if (stage === 'auto_stage' && (ev.matched != null || ev.created != null))
          detail = `${ev.matched ?? 0} matchet · ${ev.created ?? 0} oprettet`
        return { ...prev, [stage]: { stage, status: status as PipelineStep['status'], message: ev.message as string, detail } }
      })
    }

    es.onerror = () => {
      es.close()
      retryRef.current += 1
      if (retryRef.current <= 10) {
        setTimeout(() => connectToEndpoint(url, summaryRef), 2000)
      } else {
        setError('Forbindelsesfejl efter 10 forsøg — prøv igen manuelt')
        setRunning(false)
      }
    }
  }

  function startPipeline() {
    if (running) return
    setRunning(true)
    setDone(false)
    setError(null)
    setSummary(null)
    setSteps({})
    runIdRef.current = null
    retryRef.current = 0
    loopRef.current = 0
    totalSummaryRef.current = {}
    setLoopIteration(0)
    setLastRunAt(new Date().toISOString())
    connectToEndpoint('/api/pipeline/run', {})
  }

  useEffect(() => () => { esRef.current?.close() }, [])

  const runButton = (
        <button
          onClick={startPipeline}
          disabled={running}
          className="shrink-0 px-5 py-2 bg-white text-gray-900 font-semibold text-sm rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center gap-2"
        >
          {running && <span className="inline-block w-3.5 h-3.5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />}
          {running
            ? loopIteration > 0 ? `Kører runde ${loopIteration + 1}…` : 'Kører pipeline…'
            : done ? '↺ Kør igen' : '▶ Kør pipeline'}
        </button>
  )

  if (collapsed) {
    const current = PIPELINE_STAGES.find(s => steps[s.key]?.status === 'running')
    const lastRun = lastRunAt ? new Date(lastRunAt).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
    return (
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl px-4 py-2.5 text-white mb-4 flex items-center gap-3 flex-wrap text-sm">
        <span className="font-semibold">🚀 Onboarding pipeline</span>
        <span className="text-gray-400 flex-1 min-w-0 truncate">
          {running
            ? `Kører${current ? ` — ${current.label}` : '…'}`
            : error
              ? <span className="text-red-300">⚠️ Fejl ved sidste kørsel</span>
              : done && summary
                ? <>Sidst kørt {lastRun}{' · '}📦 {summary.products_created ?? 0} produkter oprettet · 🔗 {summary.groups_created ?? 0} nye grupper{(summary.remaining ?? 0) > 0 && <span className="text-orange-300"> · ⏳ {summary.remaining} tilbage</span>}</>
                : lastRun ? `Sidst kørt ${lastRun}` : 'Ikke kørt endnu'}
        </span>
        <button onClick={toggleCollapsed} className="px-3 py-1.5 text-xs text-gray-200 border border-white/20 rounded-lg hover:bg-white/10">
          Vis detaljer ▾
        </button>
        {runButton}
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-5 text-white mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base mb-0.5">🚀 Onboarding pipeline</h3>
          <p className="text-gray-400 text-sm">
            Kører automatisk: kategorioprydning → matching → auto-bekræft → produktoprettelse → kategorisering → match-forslag
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={toggleCollapsed} title="Minimér panelet, så listen får mere plads"
            className="px-3 py-2 text-xs text-gray-200 border border-white/20 rounded-lg hover:bg-white/10">
            Minimér ▴
          </button>
          {runButton}
        </div>
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

  // Fælles variant-egenskaber (Sortiment → Variant-egenskaber) — bruges til forslag på variant-kortene
  const [attrDefs, setAttrDefs] = useState<VariantAttributeDef[]>([])
  useEffect(() => {
    fetch('/api/variant-attributes').then(r => r.json()).then(j => setAttrDefs(j.data ?? [])).catch(() => {})
  }, [])

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

  // Returnerer en fejltekst, eller null hvis det lykkedes
  async function handleUpdate(id: string, patch: GroupPatch): Promise<string | null> {
    try {
      const res = await fetch(`/api/matching/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      if (!res.ok) return (await res.json().catch(() => ({}))).error ?? `Kunne ikke gemme (${res.status})`
    } catch {
      return 'Ingen forbindelse'
    }
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } as MatchGroup : g))
    return null
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Header (scroller væk med siden, så listen får hele skærmen) ── */}
      <div className="bg-white px-6 pt-4">
        <ImportFlow className="mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">Saml ens varer</h2>
        <p className="text-sm text-gray-500 mb-2">Trin 3: Systemet har fundet varer, der ser ud til at være den samme vare hos flere leverandører. Sig ja, hvis de hører sammen — så bliver de til ét produkt i kataloget med flere leverandører.</p>
        <details className="group text-sm bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 mb-4 leading-relaxed">
          <summary className="cursor-pointer font-medium text-blue-800 list-none flex items-center gap-1.5 select-none">
            <span className="transition-transform group-open:rotate-90">▸</span> Hvad gør du her?
          </summary>
          <div className="text-blue-700 mt-1.5 space-y-1.5">
            <p>Hvert kort er et <strong>forslag</strong> om, at nogle leverandørvarer er den samme vare (eller varianter af den, fx samme fender i flere størrelser eller farver).</p>
            <ul className="list-none space-y-0.5">
              <li>🟰 / 🔀 Vælg først, om det er <strong>samme vare</strong> (fra flere leverandører) eller <strong>varianter</strong> (samme produkt i fx forskellige størrelser eller farver). Ved varianter angiver du, hvad der adskiller dem.</li>
              <li>✅ <strong>Bekræft</strong> — de hører sammen. Der oprettes ét produkt (med varianter, hvis du valgte det).</li>
              <li>✕ <strong>Afvis</strong> — de hører ikke sammen. Varerne kommer videre til trin 4.</li>
              <li>☑️ Fjern fluebenet ved en vare, der ikke passer ind i gruppen, før du bekræfter.</li>
            </ul>
            <p>Fanerne viser, <em>hvorfor</em> varerne er foreslået: <strong>Samme EAN</strong> (stregkode — næsten altid rigtigt), <strong>Lignende navn</strong> (tjek efter) og <strong>Varianter</strong>. Varer uden noget match finder du under <a href="/admin/staging" className="underline font-medium">Nye varer</a>.</p>
          </div>
        </details>

        {/* Pipeline panel */}
        <PipelinePanel onDone={fetchGroups} />

        {/* Stats */}
        {stats && (
          <div className="flex gap-3 flex-wrap text-sm mb-3">
            {[
              { label: 'Forslag at gennemgå',  value: stats.pending,    color: 'text-orange-700' },
              { label: 'Samme EAN',            value: stats.high,       color: 'text-green-700'  },
              { label: 'Lignende navn',        value: stats.medium,     color: 'text-yellow-700' },
              { label: 'Varianter',            value: stats.variant,    color: 'text-purple-700' },
              { label: 'Bekræftet',            value: stats.confirmed,  color: 'text-blue-700'   },
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

      </div>

      {/* Filter tabs — bliver stående øverst, når man scroller i listen */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-2.5">
        <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden w-fit max-w-full overflow-x-auto text-sm bg-white">
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
      <div className="flex-1 px-6 py-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Henter grupper...</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="text-2xl mb-2">🎯</div>
            <div className="font-medium text-gray-500 mb-1">Ingen leverandørgrupperinger afventer gennemgang</div>
            <div className="text-sm">Kør pipeline ovenfor for at importere og matche leverandørprodukter</div>
          </div>
        ) : (
          <div className="space-y-3 max-w-5xl">
            {groups.map(g => (
              <GroupCard
                key={`${g.id}-${attrDefs.length}`}
                group={g}
                onUpdate={handleUpdate}
                attrDefs={attrDefs}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur px-6 py-3 flex items-center justify-between">
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
