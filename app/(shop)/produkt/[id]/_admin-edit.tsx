'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// Vises kun for indloggede admins (siden tjekker sessionen). Gemmer via PATCH /api/products/[id],
// som middleware.ts beskytter med admin-sessionen.

export type EditableProduct = {
  id: string
  name: string
  brand: string | null
  sales_price: number | null
  status: string
  categories: string[]
  short_description: string | null
  description: string | null
}

const STATUSES: [string, string][] = [
  ['draft',     'Kladde'],
  ['validated', 'Valideret'],
  ['published', 'Publiceret'],
]

const inputCls = 'w-full px-3 py-1.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'flex flex-col gap-1 text-xs font-medium text-gray-500'

export function AdminEdit({ product }: { product: EditableProduct }) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  // Kategoriforslag hentes først, når panelet åbnes (ikke ved hver sidevisning)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [optionsLoaded, setOptionsLoaded]     = useState(false)
  useEffect(() => {
    if (!open || optionsLoaded) return
    setOptionsLoaded(true)
    fetch('/api/products/category-options')
      .then(r => r.ok ? r.json() : { options: [] })
      .then(j => setCategoryOptions(Array.isArray(j.options) ? j.options : []))
      .catch(() => {})
  }, [open, optionsLoaded])
  const [form, setForm]     = useState(product)
  const [price, setPrice]   = useState(product.sales_price != null ? String(product.sales_price).replace('.', ',') : '')
  const [newCat, setNewCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  const set = <K extends keyof EditableProduct>(k: K, v: EditableProduct[K]) => setForm(f => ({ ...f, [k]: v }))

  const parsedPrice = price.trim() === '' ? null : Number(price.replace(/\./g, '').replace(',', '.'))
  const priceInvalid = parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)

  // Kun de felter der faktisk er ændret sendes (så samtidige ændringer i andre felter ikke overskrives)
  const changes = useMemo(() => {
    const c: Record<string, unknown> = {}
    if (form.name.trim() !== product.name) c.name = form.name.trim()
    if ((form.brand?.trim() || null) !== product.brand) c.brand = form.brand?.trim() || null
    if (!priceInvalid && parsedPrice !== product.sales_price) c.sales_price = parsedPrice
    if (form.status !== product.status) c.status = form.status
    if (JSON.stringify(form.categories) !== JSON.stringify(product.categories)) c.categories = form.categories
    if ((form.short_description ?? '') !== (product.short_description ?? '')) c.short_description = form.short_description || null
    if ((form.description ?? '') !== (product.description ?? '')) c.description = form.description || null
    return c
  }, [form, parsedPrice, priceInvalid, product])
  const dirty = Object.keys(changes).length > 0

  function addCategory(raw: string) {
    const name = raw.trim()
    if (!name) return
    // Brug den eksisterende stavemåde, hvis kategorien findes (ellers bliver det en ny kategori i shoppen)
    const existing = categoryOptions.find(o => o.toLowerCase() === name.toLowerCase()) ?? name
    if (!form.categories.some(c => c.toLowerCase() === existing.toLowerCase())) set('categories', [...form.categories, existing])
    setNewCat('')
  }
  const removeCategory = (c: string) => set('categories', form.categories.filter(x => x !== c))
  const makePrimary    = (c: string) => set('categories', [c, ...form.categories.filter(x => x !== c)])

  const isNewCategory = (c: string) => optionsLoaded && categoryOptions.length > 0 && !categoryOptions.some(o => o.toLowerCase() === c.toLowerCase())

  async function save() {
    if (!dirty || priceInvalid || !form.name.trim()) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      })
      if (res.status === 401) { setMsg({ ok: false, text: 'Din admin-session er udløbet — log ind igen.' }); return }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMsg({ ok: false, text: j.error ? `Kunne ikke gemme: ${j.error}` : 'Kunne ikke gemme.' })
        return
      }
      setMsg({ ok: true, text: 'Gemt.' })
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'Ingen forbindelse — prøv igen.' })
    } finally {
      setSaving(false)
    }
  }

  function close() {
    if (dirty && !confirm('Du har ændringer, der ikke er gemt. Luk alligevel?')) return
    setForm(product); setPrice(product.sales_price != null ? String(product.sales_price).replace('.', ',') : '')
    setMsg(null); setOpen(false)
  }

  // Når siden er opdateret efter gem, kommer nye props ind — så nulstilles formen til de gemte værdier
  const [seen, setSeen] = useState(product)
  if (seen !== product) {
    setSeen(product); setForm(product)
    setPrice(product.sales_price != null ? String(product.sales_price).replace('.', ',') : '')
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 md:bottom-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium shadow-lg hover:bg-gray-700">
        ✏️ Rediger produkt
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-label="Rediger produkt">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col font-sans">
        <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Admin</p>
            <h2 className="text-base font-semibold text-gray-900">Rediger produkt</h2>
          </div>
          <button onClick={close} className="text-2xl leading-none text-gray-400 hover:text-gray-600" aria-label="Luk">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <label className={labelCls}>
            Navn
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Brand
              <input className={inputCls} value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} />
            </label>
            <label className={labelCls}>
              Salgspris (kr)
              <input className={`${inputCls} ${priceInvalid ? 'border-red-400 focus:ring-red-400' : ''}`} inputMode="decimal"
                value={price} onChange={e => setPrice(e.target.value)} placeholder="Kontakt for pris" />
            </label>
          </div>

          <label className={labelCls}>
            Status
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!STATUSES.some(([v]) => v === form.status) && <option value={form.status}>{form.status}</option>}
            </select>
          </label>

          <div className={labelCls}>
            <span>Kategorier <span className="font-normal text-gray-400">— den første bruges i brødkrummen og til &quot;Flere i …&quot;</span></span>
            <div className="flex flex-wrap gap-1.5">
              {form.categories.length === 0 && <span className="text-sm font-normal text-gray-400">Ingen kategorier</span>}
              {form.categories.map((c, i) => (
                <span key={c} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border ${
                  i === 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                  {i === 0 && <span title="Primær kategori">★</span>}
                  {c}
                  {isNewCategory(c) && <span className="text-amber-600" title="Ny kategori — findes ikke på andre produkter endnu">(ny)</span>}
                  {i > 0 && (
                    <button type="button" onClick={() => makePrimary(c)} title="Gør til primær"
                      className="px-1 text-gray-400 hover:text-blue-600">☆</button>
                  )}
                  <button type="button" onClick={() => removeCategory(c)} title="Fjern"
                    className="px-1 text-gray-400 hover:text-red-600">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} list="admin-cat-options" value={newCat} placeholder="Tilføj kategori…"
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(newCat) } }} />
              <button type="button" onClick={() => addCategory(newCat)} disabled={!newCat.trim()}
                className="px-3 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40">Tilføj</button>
            </div>
            <datalist id="admin-cat-options">
              {categoryOptions.filter(o => !form.categories.includes(o)).map(o => <option key={o} value={o} />)}
            </datalist>
          </div>

          <label className={labelCls}>
            Kort beskrivelse
            <textarea className={`${inputCls} min-h-20`} value={form.short_description ?? ''}
              onChange={e => set('short_description', e.target.value)} />
          </label>

          <label className={labelCls}>
            Beskrivelse
            <textarea className={`${inputCls} min-h-40`} value={form.description ?? ''}
              onChange={e => set('description', e.target.value)} />
          </label>

          <a href={`/admin/products/${product.id}`} className="inline-block text-sm text-blue-600 hover:underline">
            Billeder, varianter, leverandører m.m. → åbn i admin
          </a>
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving || priceInvalid || !form.name.trim()}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-40">
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
          {!msg && dirty && <span className="text-xs text-gray-400">{Object.keys(changes).length} ændring(er)</span>}
        </footer>
      </div>
    </div>
  )
}
