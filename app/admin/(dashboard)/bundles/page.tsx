'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CampaignProduct {
  id: string
  product_id: string
  quantity: number
  override_price: number | null
  product?: { name: string; internal_sku: string }
}

interface Record_ {
  id: string
  record_type: 'bundle' | 'campaign'
  name: string
  description: string | null
  discount_pct: number | null
  kit_price: number | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  campaign_products?: CampaignProduct[]
}

type Tab = 'bundle' | 'campaign'

// ── DateWindow badge ───────────────────────────────────────────────────────────
function DateWindow({ starts_at, ends_at }: { starts_at: string | null; ends_at: string | null }) {
  if (!starts_at) return null
  const now   = new Date()
  const start = new Date(starts_at)
  const end   = ends_at ? new Date(ends_at) : null

  let status: 'upcoming' | 'active' | 'expired' = 'active'
  if (now < start)        status = 'upcoming'
  else if (end && now > end) status = 'expired'

  const colors = {
    upcoming: 'bg-blue-50  text-blue-700',
    active:   'bg-green-50 text-green-700',
    expired:  'bg-gray-100 text-gray-400 line-through',
  }
  const labels = { upcoming: '⏳ Fra', active: '✅ Aktiv', expired: '⌛ Udløbet' }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status]}`}>
      {labels[status]} {fmtDate(starts_at)}{end ? ` – ${fmtDate(ends_at)}` : ''}
    </span>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('da-DK')
}

// ── ExpandedRecord ─────────────────────────────────────────────────────────────
function ExpandedRecord({ rec, onSaved }: { rec: Record_; onSaved: () => void }) {
  const [startsAt, setStartsAt] = useState(rec.starts_at ? rec.starts_at.slice(0, 10) : '')
  const [endsAt,   setEndsAt]   = useState(rec.ends_at   ? rec.ends_at.slice(0, 10)   : '')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  async function saveDates() {
    setSaving(true)
    const r = await fetch(`/api/campaigns/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starts_at: startsAt || null,
        ends_at:   endsAt   || null,
      }),
    })
    setSaving(false)
    if (r.ok) { setMsg('Gemt ✓'); onSaved(); setTimeout(() => setMsg(''), 3000) }
    else { const j = await r.json(); setMsg(`Fejl: ${j.error}`) }
  }

  return (
    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-4">
      {rec.description && (
        <p className="text-sm text-gray-600">{rec.description}</p>
      )}

      {/* Aktiv periode */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aktiv periode</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aktiv fra</label>
            <input type="date"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aktiv til</label>
            <input type="date"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
            />
          </div>
          <button onClick={saveDates} disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Gemmer…' : 'Gem datoer'}
          </button>
          {msg && <span className="text-sm text-green-700">{msg}</span>}
        </div>
        {!startsAt && !endsAt && (
          <p className="text-xs text-gray-400 mt-1 italic">Ingen datoer sat — aktiv/inaktiv styres kun manuelt</p>
        )}
      </div>

      <div className="text-xs text-gray-400">ID: {rec.id}</div>
      <p className="text-sm text-gray-400 italic">
        Tilknyt produkter fra produktkortet (Bundler &amp; Kampagner-sektionen).
      </p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BundlesPage() {
  const [tab, setTab] = useState<Tab>('bundle')
  const [records, setRecords] = useState<Record_[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState('')

  // New record form state
  const [form, setForm] = useState({
    name: '', description: '', discount_pct: '', kit_price: '',
    starts_at: '', ends_at: '', is_active: true, use_dates: false,
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/campaigns?type=${tab}`)
    const j = await r.json()
    setRecords(j.data ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  async function create() {
    setSaving(true)
    const body: Record<string, unknown> = {
      record_type:  tab,
      name:         form.name,
      description:  form.description || null,
      is_active:    form.is_active,
      // Aktiv periode — gælder for både bundles og kampagner
      starts_at:    (form.use_dates && form.starts_at) ? form.starts_at : null,
      ends_at:      (form.use_dates && form.ends_at)   ? form.ends_at   : null,
    }
    if (tab === 'campaign') {
      body.discount_pct = form.discount_pct ? Number(form.discount_pct) : null
    } else {
      body.kit_price = form.kit_price ? Number(form.kit_price) : null
    }

    const r = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      setShowForm(false)
      setForm({ name: '', description: '', discount_pct: '', kit_price: '', starts_at: '', ends_at: '', is_active: true, use_dates: false })
      setMsg(`${tab === 'bundle' ? 'Bundle' : 'Kampagne'} oprettet ✓`)
      await load()
    } else {
      const j = await r.json()
      setMsg(`Fejl: ${j.error}`)
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 4000)
  }

  async function toggleActive(rec: Record_) {
    await fetch(`/api/campaigns/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rec.is_active }),
    })
    await load()
  }

  const isCampaign = tab === 'campaign'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bundler &amp; Kampagner</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bundler grupperer produkter uden tidsbegrænsning. Kampagner er tidsbestemte tilbud med rabat.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          + {isCampaign ? 'Ny kampagne' : 'Nyt bundle'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['bundle', 'campaign'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setExpanded(null) }}
            className={`px-5 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'bundle' ? '📦 Bundler' : '🏷️ Kampagner'}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2 bg-blue-50 text-blue-800 text-sm rounded-lg">{msg}</div>
      )}

      {/* New record form */}
      {showForm && (
        <div className="mb-6 bg-white border border-blue-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">
            {isCampaign ? 'Opret kampagne' : 'Opret bundle'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Navn *</label>
              <input
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={isCampaign ? 'Sommer-tilbud 2025' : 'Anker-startsæt'}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Beskrivelse</label>
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            {/* Type-specifik: rabat % for kampagner, kit-pris for bundler */}
            {isCampaign ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rabat %</label>
                <input type="number" step="0.1" min="0" max="100"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  placeholder="f.eks. 15"
                  value={form.discount_pct}
                  onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kit-pris (samlet bundlepris, valgfri)</label>
                <input type="number" step="0.01"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  placeholder="f.eks. 1499.00"
                  value={form.kit_price}
                  onChange={e => setForm(f => ({ ...f, kit_price: e.target.value }))}
                />
              </div>
            )}

            {/* Aktiv periode — gælder for ALLE typer */}
            <div className="col-span-2 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" id="use_dates"
                  checked={form.use_dates}
                  onChange={e => setForm(f => ({ ...f, use_dates: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="use_dates" className="text-sm font-medium text-gray-700">
                  Aktiv i en bestemt periode (start- og slutdato)
                </label>
              </div>
              {form.use_dates && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Aktiv fra</label>
                    <input type="date"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      value={form.starts_at}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Aktiv til</label>
                    <input type="date"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                      value={form.ends_at}
                      onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                    />
                  </div>
                </div>
              )}
              {!form.use_dates && (
                <p className="text-xs text-gray-400 italic">Ingen slutdato — gælder indtil manuelt deaktiveret</p>
              )}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active_new"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="is_active_new" className="text-sm text-gray-700">Aktiv</label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={create} disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Gemmer…' : 'Opret'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:underline">
              Annuller
            </button>
          </div>
        </div>
      )}

      {/* Records list */}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Indlæser…</p>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">{isCampaign ? '🏷️' : '📦'}</div>
          <p className="text-sm">Ingen {isCampaign ? 'kampagner' : 'bundler'} endnu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(rec => (
            <div key={rec.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${rec.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-medium text-gray-900">{rec.name}</span>
                  {rec.discount_pct != null && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      {rec.discount_pct}% rabat
                    </span>
                  )}
                  {rec.kit_price != null && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Kit-pris {fmt(rec.kit_price)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  {/* Dato-vindue — vises for alle typer der har datoer */}
                  {rec.starts_at && (
                    <DateWindow starts_at={rec.starts_at} ends_at={rec.ends_at} />
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); toggleActive(rec) }}
                    className={`text-xs px-2 py-0.5 rounded ${rec.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {rec.is_active ? 'Aktiv' : 'Inaktiv'}
                  </button>
                  <span className="text-gray-300">{expanded === rec.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded === rec.id && (
                <ExpandedRecord rec={rec} onSaved={load} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
