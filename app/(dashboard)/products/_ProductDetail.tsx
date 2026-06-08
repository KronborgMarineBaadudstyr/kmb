'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────
export type Supplier = { id: string; name: string; contact_email: string | null; data_format: string | null }
export type ProductSupplier = {
  id: string; priority: number; is_active: boolean
  variant_id: string | null
  supplier_sku: string; manufacturer_sku: string | null; supplier_product_name: string | null
  purchase_price: number | null; recommended_sales_price: number | null
  delivery_days_min: number | null; delivery_days_max: number | null
  moq: number; supplier_stock_quantity: number; supplier_stock_reserved: number
  item_status: string; supplier_images: unknown; supplier_files: unknown
  extra_data: Record<string, unknown> | null
  updated_at: string; suppliers: Supplier
}
export type VariantBarcode = {
  id: string; ean: string; is_primary: boolean; note: string | null; created_at: string
}
export type Variant = {
  id: string; internal_variant_sku: string
  attributes: { name: string; value: string }[]
  own_stock_quantity: number; own_stock_reserved: number
  sales_price: number | null; sale_price: number | null; ean: string | null
  weight: number | null
  hide_when_out_of_stock: boolean
  woo_variation_id: number | null; status: string
  variant_barcodes?: VariantBarcode[]
  supplier?: {
    name: string; supplier_sku: string; supplier_product_name: string | null
    purchase_price: number | null
    supplier_stock_quantity: number
    image_url?: string | null
  }
}
export type ProductImage = { id: string; url: string; alt_text: string | null; is_primary: boolean; position: number; source: string; storage_path: string | null }
export type ProductFile  = { id: string; url: string; file_name: string; file_type: string; language: string; position: number; source: string }
export type Product = {
  id: string
  internal_sku: string
  name: string
  description: string | null
  short_description: string | null
  manufacturer_id: string | null
  manufacturer_sku: string | null
  ean: string | null
  brand: string | null
  slug: string | null
  sales_price: number | null
  sale_price: number | null
  tax_class: string | null
  own_stock_quantity: number
  own_stock_reserved: number
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  categories: string[]
  tags: string[]
  attributes: { name: string; value: string | string[] }[]
  specifications: Record<string, unknown> | null
  video_url: string | null
  woo_product_id: number | null
  woo_bestillingsnummer: string | null
  pos_product_id: string | null
  meta_title: string | null
  meta_description: string | null
  status: string
  woo_sync_status: string | null
  hide_when_out_of_stock: boolean
  created_at: string
  updated_at: string
  last_synced_woo_at: string | null
  last_synced_pos_at: string | null
  original_number: string | null
  original_number_source: string | null
  manufacturers: { id: string; name: string; country: string | null; website: string | null } | null
  product_images: ProductImage[]
  product_files: ProductFile[]
  product_variants: Variant[]
  product_suppliers: ProductSupplier[]
}

export type Campaign = {
  id: string
  name: string
  type: 'individual' | 'bundle_qty' | 'bundle_kit'
  discount_type: 'percentage' | 'fixed_price' | 'fixed_amount'
  discount_value: number | null
  bundle_qty: number | null
  kit_price: number | null
  start_date: string | null
  end_date: string | null
  status: string
  campaign_products: { product_id: string; sale_price: number | null }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  validated: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
}
const ITEM_STATUS_COLORS: Record<string, string> = {
  active:        'bg-green-50 text-green-700',
  new:           'bg-blue-50 text-blue-700',
  price_changed: 'bg-yellow-50 text-yellow-700',
  discontinued:  'bg-red-50 text-red-700',
  out_of_stock:  'bg-orange-50 text-orange-700',
}

// ─── Inline editable field ────────────────────────────────────────────────────
function InlineField({
  label, value, displayValue, type = 'text', multiline = false, options,
  mono = false, onSave, saving,
}: {
  label: string
  value: string | number | null
  displayValue?: React.ReactNode
  type?: string
  multiline?: boolean
  options?: { value: string; label: string }[]
  mono?: boolean
  onSave: (val: string | number | null) => void
  saving?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null)

  function openEdit() {
    setDraft(value == null ? '' : String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  function commit() {
    setEditing(false)
    const parsed = type === 'number'
      ? (draft === '' ? null : Number(draft))
      : (draft.trim() === '' ? null : draft.trim())
    if (parsed !== value) onSave(parsed)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !multiline) commit()
    if (e.key === 'Escape') setEditing(false)
  }

  const isEmpty = value === null || value === undefined || value === ''
  const inputCls = 'w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0 group">
      <dt className="w-32 shrink-0 text-xs text-gray-400 pt-0.5 leading-5">{label}</dt>
      <dd className="flex-1 min-w-0">
        {editing ? (
          options ? (
            <select ref={inputRef as React.Ref<HTMLSelectElement>} className={inputCls}
              value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : multiline ? (
            <textarea ref={inputRef as React.Ref<HTMLTextAreaElement>} className={inputCls + ' resize-y'}
              rows={4} value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={commit} onKeyDown={onKey} />
          ) : (
            <input ref={inputRef as React.Ref<HTMLInputElement>} type={type}
              className={inputCls + (mono ? ' font-mono text-xs' : '')}
              value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={commit} onKeyDown={onKey} />
          )
        ) : (
          <button onClick={openEdit}
            className={`text-left w-full text-sm leading-5 rounded px-1 -mx-1 py-0.5 hover:bg-blue-50 transition-colors ${
              isEmpty ? 'text-gray-300' : mono ? 'font-mono text-xs text-gray-700' : 'text-gray-900'
            } ${saving ? 'opacity-60' : ''}`}
            title="Klik for at redigere">
            {saving ? <span className="text-blue-400">Gemmer...</span>
              : displayValue ?? (isEmpty ? '—' : String(value))}
          </button>
        )}
      </dd>
    </div>
  )
}

// ─── Section card ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ─── Read-only field ───────────────────────────────────────────────────────────
function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const isEmpty = value === null || value === undefined || value === ''
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <dt className="w-32 shrink-0 text-xs text-gray-400 pt-0.5 leading-5">{label}</dt>
      <dd className={`text-sm flex-1 leading-5 ${isEmpty ? 'text-gray-300' : 'text-gray-900'} ${mono ? 'font-mono text-xs' : ''}`}>
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}

// ─── Numeric click-to-edit ─────────────────────────────────────────────────────
function NumericInput({ value, onSave, suffix, placeholder }: {
  value: number | null; onSave: (v: number | null) => void; suffix?: string; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const ref = useRef<HTMLInputElement>(null)

  function open() { setDraft(value == null ? '' : String(value)); setEditing(true); setTimeout(() => ref.current?.focus(), 0) }
  function commit() {
    setEditing(false)
    const parsed = draft === '' ? null : Number(draft)
    if (parsed !== value) onSave(parsed)
  }

  if (editing) return (
    <input ref={ref} type="number" value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder={placeholder}
      className="px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white w-full" />
  )
  return (
    <button onClick={open} className={`text-left w-full px-2 py-1 text-xs rounded hover:bg-blue-50 transition-colors ${value != null ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
      {value != null ? `${value.toLocaleString('da-DK')}${suffix ?? ''}` : placeholder ?? '—'}
    </button>
  )
}

// ─── String click-to-edit ──────────────────────────────────────────────────────
function AttrValueInput({ value, onSave, placeholder, mono }: {
  value: string; onSave: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  function open() { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 0) }
  function commit() { setEditing(false); if (draft !== value) onSave(draft) }

  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder={placeholder}
      className={`px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white w-full ${mono ? 'font-mono' : ''}`} />
  )
  return (
    <button onClick={open} className={`text-left w-full px-2 py-1 text-xs rounded hover:bg-blue-50 transition-colors ${value ? (mono ? 'font-mono text-gray-700' : 'text-gray-900') : 'text-gray-300'}`}>
      {value || placeholder || '—'}
    </button>
  )
}

// ─── Save variant button ───────────────────────────────────────────────────────
function SaveVariantButton({ onSave }: { onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  return (
    <button disabled={saving}
      onClick={async () => { setSaving(true); try { await onSave() } finally { setSaving(false) } }}
      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
      {saving ? 'Gemmer…' : 'Gem'}
    </button>
  )
}

// ─── Original number selector ─────────────────────────────────────────────────
// Shows all available ID fields across product + suppliers + variants.
// User clicks ☆ on any to designate it as the external "original number".
function OriginalNumberSelector({ product, suppliers, variants, onSet }: {
  product:   Pick<Product, 'internal_sku' | 'ean' | 'manufacturer_sku' | 'woo_bestillingsnummer' | 'original_number' | 'original_number_source'>
  suppliers: ProductSupplier[]
  variants:  Variant[]
  onSet:     (value: string, source: string) => Promise<void>
}) {
  const [setting, setSetting] = useState<string | null>(null)

  async function pick(value: string, source: string) {
    setSetting(source)
    await onSet(value, source)
    setSetting(null)
  }

  const current = product.original_number

  // Build flat list of all ID options
  const ids: { value: string; label: string; source: string }[] = []

  if (product.internal_sku)
    ids.push({ value: product.internal_sku,       label: 'Internt varenr.',      source: 'internal_sku' })
  if (product.ean)
    ids.push({ value: product.ean,                label: 'EAN / stregkode',      source: 'ean' })
  if (product.manufacturer_sku)
    ids.push({ value: product.manufacturer_sku,   label: 'Producent SKU',        source: 'manufacturer_sku' })
  if (product.woo_bestillingsnummer)
    ids.push({ value: product.woo_bestillingsnummer, label: 'Bestillingsnr.',    source: 'woo_bestillingsnummer' })

  for (const s of suppliers) {
    if (s.supplier_sku)
      ids.push({ value: s.supplier_sku, label: `${s.suppliers.name} — lev.nr.`, source: `supplier_sku:${s.id}` })
    if (s.manufacturer_sku && s.manufacturer_sku !== product.manufacturer_sku)
      ids.push({ value: s.manufacturer_sku, label: `${s.suppliers.name} — prod.nr.`, source: `mfr_sku:${s.id}` })
  }

  for (const v of variants) {
    const attrLabel = v.attributes.filter(a => a.value).map(a => a.value).join(' / ') || v.internal_variant_sku
    ids.push({ value: v.internal_variant_sku, label: `Variant SKU (${attrLabel})`, source: `variant_sku:${v.id}` })
    const primaryBarcode = v.variant_barcodes?.find(b => b.is_primary)
    if (primaryBarcode)
      ids.push({ value: primaryBarcode.ean, label: `Variant EAN (${attrLabel})`, source: `variant_ean:${v.id}` })
  }

  const sourceLabel = (src: string | null) => {
    if (!src) return ''
    if (src === 'internal_sku')          return 'Internt varenr.'
    if (src === 'ean')                   return 'EAN'
    if (src === 'manufacturer_sku')      return 'Producent SKU'
    if (src === 'woo_bestillingsnummer') return 'Bestillingsnr.'
    if (src === 'manual')                return 'Manuel'
    if (src.startsWith('supplier_sku:')) return 'Leverandør-nr.'
    if (src.startsWith('mfr_sku:'))      return 'Lev. producent-nr.'
    if (src.startsWith('variant_sku:'))  return 'Variant SKU'
    if (src.startsWith('variant_ean:'))  return 'Variant EAN'
    return src
  }

  return (
    <div>
      {current ? (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-blue-500 text-base leading-none">★</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono font-semibold text-blue-800">{current}</span>
            <span className="text-xs text-blue-400 ml-1.5">({sourceLabel(product.original_number_source)})</span>
          </div>
          <button onClick={() => pick('', 'manual')}
            className="text-xs text-blue-400 hover:text-red-400 transition-colors" title="Fjern originalnummer">×</button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-2">Intet originalnummer sat — klik ☆ for at vælge</p>
      )}
      <div className="space-y-0.5">
        {ids.map(id => {
          const isCurrent = id.value === current
          const isSetting = setting === id.source
          return (
            <div key={id.source} className={`flex items-center gap-2 rounded px-2 py-1.5 group transition-colors
              ${isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <button
                onClick={() => !isCurrent && pick(id.value, id.source)}
                disabled={isSetting || isCurrent}
                className={`shrink-0 text-base leading-none transition-colors ${
                  isCurrent  ? 'text-blue-500 cursor-default' :
                  isSetting  ? 'text-gray-300' :
                  'text-gray-200 group-hover:text-blue-400 hover:text-blue-500'
                }`}
                title={isCurrent ? 'Aktivt originalnummer' : 'Sæt som originalnummer'}>
                {isSetting ? '…' : isCurrent ? '★' : '☆'}
              </button>
              <span className="text-xs text-gray-400 shrink-0 w-32 truncate" title={id.label}>{id.label}</span>
              <span className={`text-xs font-mono truncate flex-1 min-w-0 ${isCurrent ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
                {id.value}
              </span>
            </div>
          )
        })}
        {ids.length === 0 && (
          <p className="text-xs text-gray-300 py-2">Ingen ID-felter tilgængelige</p>
        )}
      </div>
    </div>
  )
}

// ─── Barcode manager for a single variant ─────────────────────────────────────
function BarcodeManager({ variant, onUpdate }: {
  variant: Variant
  onUpdate: (barcodes: VariantBarcode[]) => void
}) {
  const [barcodes, setBarcodes]   = useState<VariantBarcode[]>(
    () => [...(variant.variant_barcodes ?? [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
  )
  const [adding,   setAdding]     = useState(false)
  const [newEan,   setNewEan]     = useState('')
  const [newNote,  setNewNote]    = useState('')
  const [saving,   setSaving]     = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote]   = useState('')

  // Keep in sync if parent reloads
  useEffect(() => {
    setBarcodes([...(variant.variant_barcodes ?? [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)))
  }, [variant.variant_barcodes])

  async function addBarcode() {
    if (!newEan.trim()) return
    setSaving(true)
    const isPrimary = barcodes.length === 0
    const res = await fetch(`/api/products/variants/${variant.id}/barcodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ean: newEan.trim(), is_primary: isPrimary, note: newNote.trim() || undefined }),
    })
    const json = await res.json()
    if (!json.error) {
      const updated = isPrimary
        ? [json.data]
        : [...barcodes, json.data]
      setBarcodes(updated)
      onUpdate(updated)
      setNewEan(''); setNewNote(''); setAdding(false)
    }
    setSaving(false)
  }

  async function setPrimary(id: string) {
    const res = await fetch(`/api/products/variants/${variant.id}/barcodes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_primary: true }),
    })
    const json = await res.json()
    if (!json.error) {
      const updated = barcodes.map(b => ({ ...b, is_primary: b.id === id }))
      setBarcodes(updated)
      onUpdate(updated)
    }
  }

  async function saveNote(id: string) {
    await fetch(`/api/products/variants/${variant.id}/barcodes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote.trim() || null }),
    })
    const updated = barcodes.map(b => b.id === id ? { ...b, note: editNote.trim() || null } : b)
    setBarcodes(updated)
    onUpdate(updated)
    setEditingId(null)
  }

  async function deleteBarcode(id: string) {
    await fetch(`/api/products/variants/${variant.id}/barcodes/${id}`, { method: 'DELETE' })
    const updated = barcodes.filter(b => b.id !== id)
    // If we deleted the primary, promote oldest
    if (!updated.some(b => b.is_primary) && updated.length > 0) updated[0].is_primary = true
    setBarcodes(updated)
    onUpdate(updated)
  }

  const inputCls = 'px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

  return (
    <div className="space-y-1.5">
      {barcodes.map(b => (
        <div key={b.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 group ${b.is_primary ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <span className={`font-mono text-xs flex-1 min-w-0 truncate ${b.is_primary ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
            {b.ean}
          </span>
          {b.is_primary && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0">primær</span>
          )}
          {editingId === b.id ? (
            <>
              <input value={editNote} onChange={e => setEditNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNote(b.id); if (e.key === 'Escape') setEditingId(null) }}
                placeholder="Batch / note…" className={inputCls + ' w-28'} autoFocus />
              <button onClick={() => saveNote(b.id)} className="text-xs text-blue-500 hover:underline shrink-0">Gem</button>
            </>
          ) : (
            <button onClick={() => { setEditingId(b.id); setEditNote(b.note ?? '') }}
              className="text-xs text-gray-300 hover:text-gray-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rediger note">
              {b.note ? <span className="text-gray-400 not-italic normal-case">{b.note}</span> : '✏️'}
            </button>
          )}
          {!b.is_primary && (
            <button onClick={() => setPrimary(b.id)} title="Sæt som primær"
              className="text-xs text-gray-300 hover:text-blue-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">★</button>
          )}
          <button onClick={() => deleteBarcode(b.id)} title="Slet stregkode"
            className="text-gray-200 hover:text-red-400 text-sm leading-none shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
        </div>
      ))}

      {adding ? (
        <div className="flex gap-1.5 items-center mt-1">
          <input value={newEan} onChange={e => setNewEan(e.target.value)} placeholder="EAN / stregkode"
            onKeyDown={e => { if (e.key === 'Enter') addBarcode(); if (e.key === 'Escape') { setAdding(false); setNewEan(''); setNewNote('') } }}
            className={inputCls + ' flex-1 font-mono'} autoFocus />
          <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Batch / note (valgfrit)"
            onKeyDown={e => { if (e.key === 'Enter') addBarcode() }}
            className={inputCls + ' w-36'} />
          <button onClick={addBarcode} disabled={!newEan.trim() || saving}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shrink-0">
            {saving ? '…' : 'Tilføj'}
          </button>
          <button onClick={() => { setAdding(false); setNewEan(''); setNewNote('') }}
            className="text-gray-400 hover:text-gray-600 text-sm shrink-0">×</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="text-xs text-blue-500 hover:underline">
          + Tilføj stregkode
        </button>
      )}
    </div>
  )
}

// ─── Economics box ─────────────────────────────────────────────────────────────
function EconomicsBox({ salesPrice, purchasePrice, salePrice, campaigns }: {
  salesPrice:   number | null
  purchasePrice: number | null
  salePrice:    number | null
  campaigns:    Campaign[]
}) {
  const sp = salesPrice
  const cp = purchasePrice
  const effectivePrice = salePrice != null && salePrice < (sp ?? Infinity) ? salePrice : sp

  const markup  = sp != null && cp != null && cp > 0 ? ((sp - cp) / cp * 100) : null
  const margin  = sp != null && cp != null && sp > 0 ? ((sp - cp) / sp * 100) : null
  const gross   = sp != null && cp != null ? (sp - cp) : null

  const now = new Date()
  const activeCampaigns = campaigns.filter(c => {
    if (c.status !== 'active') return false
    if (c.start_date && new Date(c.start_date) > now) return false
    if (c.end_date   && new Date(c.end_date)   < now) return false
    return true
  })
  const upcomingCampaigns = campaigns.filter(c =>
    c.status === 'active' && c.start_date && new Date(c.start_date) > now
  )

  function customerSaving(c: Campaign): number | null {
    if (!sp) return null
    switch (c.discount_type) {
      case 'percentage':   return c.discount_value != null ? sp * c.discount_value / 100 : null
      case 'fixed_amount': return c.discount_value
      case 'fixed_price': {
        const cp2 = c.campaign_products[0]?.sale_price
        return cp2 != null ? sp - cp2 : null
      }
    }
  }

  function campaignBadgeColor(c: Campaign) {
    switch (c.type) {
      case 'bundle_qty': return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'bundle_kit': return 'bg-purple-50 text-purple-700 border-purple-200'
      default:           return 'bg-blue-50 text-blue-700 border-blue-200'
    }
  }
  function campaignTypeLabel(c: Campaign) {
    switch (c.type) {
      case 'bundle_qty': return `Køb ${c.bundle_qty ?? '?'}+ stk.`
      case 'bundle_kit': return 'Samlet pris'
      default:           return 'Kampagne'
    }
  }

  if (sp == null && cp == null && activeCampaigns.length === 0 && upcomingCampaigns.length === 0) return null

  return (
    <div className="px-3 py-3 border-t border-gray-100 space-y-2.5">
      {/* ── Economics ── */}
      {(sp != null || cp != null) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Økonomi</p>
          <div className="grid grid-cols-3 gap-2">
            {markup != null && (
              <div className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
                <p className={`text-sm font-bold tabular-nums ${markup > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {markup.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Avance</p>
              </div>
            )}
            {margin != null && (
              <div className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
                <p className={`text-sm font-bold tabular-nums ${margin > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {margin.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Dækningsgrad</p>
              </div>
            )}
            {gross != null && (
              <div className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
                <p className={`text-sm font-bold tabular-nums ${gross > 0 ? 'text-gray-800' : 'text-red-600'}`}>
                  {gross.toLocaleString('da-DK', { maximumFractionDigits: 2 })} kr
                </p>
                <p className="text-xs text-gray-400 mt-0.5">DB pr. stk.</p>
              </div>
            )}
          </div>
          {effectivePrice != null && cp != null && effectivePrice !== sp && (
            <p className="text-xs text-orange-600 mt-1.5">
              Med tilbudspris: avance {cp > 0 ? ((effectivePrice - cp) / cp * 100).toFixed(1) : '—'}%,
              DG {effectivePrice > 0 ? ((effectivePrice - cp) / effectivePrice * 100).toFixed(1) : '—'}%
            </p>
          )}
        </div>
      )}

      {/* ── Campaigns ── */}
      {(activeCampaigns.length > 0 || upcomingCampaigns.length > 0) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Kampagner</p>
          <div className="space-y-2">
            {[...activeCampaigns, ...upcomingCampaigns].map(c => {
              const saving = customerSaving(c)
              const isActive = activeCampaigns.includes(c)
              return (
                <div key={c.id} className={`rounded-lg border px-3 py-2 ${campaignBadgeColor(c)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold truncate">{c.name}</span>
                        <span className="text-xs opacity-70 border rounded px-1.5 py-0.5 font-medium shrink-0">
                          {campaignTypeLabel(c)}
                        </span>
                        {!isActive && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 rounded px-1.5 py-0.5 shrink-0">
                            Kommende
                          </span>
                        )}
                      </div>
                      {(c.start_date || c.end_date) && (
                        <p className="text-xs opacity-60 mt-0.5">
                          {c.start_date ? new Date(c.start_date).toLocaleDateString('da-DK') : ''}
                          {c.start_date && c.end_date ? ' – ' : ''}
                          {c.end_date ? new Date(c.end_date).toLocaleDateString('da-DK') : ''}
                        </p>
                      )}
                    </div>
                    {saving != null && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          {c.discount_type === 'percentage'
                            ? `-${c.discount_value}%`
                            : `-${saving.toLocaleString('da-DK', { maximumFractionDigits: 2 })} kr`}
                        </p>
                        <p className="text-xs opacity-60">besparelse</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Variant editor ────────────────────────────────────────────────────────────
function VariantsEditor({ variants, onChange, campaigns }: {
  variants:  Variant[]
  onChange:  (updated: Variant[]) => void
  campaigns: Campaign[]
}) {
  const [savingId,     setSavingId]     = useState<string | null>(null)
  const [expandedIdxs, setExpandedIdxs] = useState<Set<number>>(new Set())

  async function patchVariant(variant: Variant, fields: Partial<Variant>) {
    setSavingId(variant.id)
    await fetch(`/api/products/variants/${variant.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    })
    onChange(variants.map(v => v.id === variant.id ? { ...v, ...fields } : v))
    setSavingId(null)
  }

  function setAttr(variantIdx: number, attrIdx: number, field: 'name' | 'value', val: string) {
    const updated = variants.map((v, vi) => {
      if (vi === variantIdx) return { ...v, attributes: v.attributes.map((a, ai) => ai === attrIdx ? { ...a, [field]: val } : a) }
      if (field === 'name' && attrIdx < v.attributes.length) return { ...v, attributes: v.attributes.map((a, ai) => ai === attrIdx ? { ...a, name: val } : a) }
      return v
    })
    onChange(updated)
  }

  function saveAttr(variantIdx: number) {
    patchVariant(variants[variantIdx], { attributes: variants[variantIdx].attributes })
  }

  function addAttr() {
    onChange(variants.map(v => ({ ...v, attributes: [...(v.attributes ?? []), { name: '', value: '' }] })))
  }

  function removeAttr(attrIdx: number) {
    const updated = variants.map(v => {
      const attrs = (v.attributes ?? []).filter((_, ai) => ai !== attrIdx)
      fetch(`/api/products/variants/${v.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: attrs }),
      })
      return { ...v, attributes: attrs }
    })
    onChange(updated)
  }

  function toggleExpand(i: number) {
    setExpandedIdxs(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  if (variants.length === 0) return <p className="text-sm text-gray-300">Ingen varianter — simpelt produkt</p>

  const inputCls = 'flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400'

  return (
    <div className="space-y-3">
      {variants.map((v, i) => {
        const isSaving    = savingId === v.id
        const isOpen      = expandedIdxs.has(i)
        const sup         = v.supplier
        const totalStock  = v.own_stock_quantity + (sup?.supplier_stock_quantity ?? 0)
        const barcodes    = v.variant_barcodes ?? []
        const primaryEan  = barcodes.find(b => b.is_primary)?.ean ?? v.ean

        return (
          <div key={v.id} className={`border rounded-lg overflow-hidden transition-colors ${isSaving ? 'border-blue-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              {sup?.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sup.image_url} alt="" className="w-9 h-9 object-contain rounded border border-gray-200 bg-white shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {sup?.supplier_product_name && (
                  <div className="text-sm font-medium text-gray-800 leading-tight truncate mb-0.5">{sup.supplier_product_name}</div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500 shrink-0">{v.internal_variant_sku}</span>
                  {sup && <span className="text-xs text-gray-500">{sup.name}</span>}
                  {sup?.supplier_sku && <span className="font-mono text-xs text-gray-400">{sup.supplier_sku}</span>}
                </div>
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {sup?.purchase_price != null && (
                    <span className="text-xs text-gray-400">Indkøb: <span className="text-gray-600 font-medium">{sup.purchase_price.toLocaleString('da-DK')} kr</span></span>
                  )}
                  {v.sales_price != null && (
                    <span className="text-xs text-gray-400">Salg: <span className="text-gray-700 font-medium">{v.sales_price.toLocaleString('da-DK')} kr</span></span>
                  )}
                  <span className={`text-xs font-medium ${totalStock > 0 ? 'text-green-600' : 'text-gray-300'}`}>Lager: {totalStock} stk</span>
                  {primaryEan && (
                    <span className="text-xs text-gray-400 font-mono" title={barcodes.length > 1 ? `${barcodes.length} stregkoder` : undefined}>
                      {primaryEan}{barcodes.length > 1 ? <span className="text-gray-300 ml-0.5">+{barcodes.length - 1}</span> : null}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => toggleExpand(i)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0 px-1.5 py-1" title={isOpen ? 'Skjul' : 'Rediger'}>
                {isOpen ? '▲' : '▼'}
              </button>
            </div>

            {isOpen && (
              <>
                <div className="px-3 py-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attributter</p>
                  {(v.attributes ?? []).map((a, j) => (
                    <div key={j} className="flex gap-1.5 items-center">
                      <input placeholder="størrelse" value={a.name}
                        onChange={e => setAttr(i, j, 'name', e.target.value)} onBlur={() => saveAttr(i)} className={inputCls} />
                      <span className="text-gray-300 text-xs">=</span>
                      <input placeholder="3 mm" value={a.value}
                        onChange={e => setAttr(i, j, 'value', e.target.value)} onBlur={() => saveAttr(i)} className={inputCls} />
                      <button onClick={() => removeAttr(j)} className="text-gray-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
                    </div>
                  ))}
                  <button onClick={addAttr} className="text-xs text-blue-500 hover:underline">+ Attribut</button>
                </div>
                <div className="px-3 py-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Salgspris (kr)</label>
                    <NumericInput value={v.sales_price} suffix=" kr" onSave={val => patchVariant(v, { sales_price: val })} placeholder="Pris" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tilbudspris (kr)</label>
                    <NumericInput value={v.sale_price} suffix=" kr" onSave={val => patchVariant(v, { sale_price: val })} placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Vægt (kg)</label>
                    <NumericInput value={v.weight ?? null} suffix=" kg" onSave={val => patchVariant(v, { weight: val as number | null })} placeholder="—" />
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-600">Skjul ved 0 på lokalt lager</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {v.hide_when_out_of_stock
                        ? v.own_stock_quantity === 0 ? '🚫 Skjult nu' : '👁 Lager-styret'
                        : '✓ Altid synlig'}
                    </p>
                  </div>
                  <button
                    onClick={() => patchVariant(v, { hide_when_out_of_stock: !v.hide_when_out_of_stock })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      v.hide_when_out_of_stock ? 'bg-yellow-400' : 'bg-gray-200'
                    }`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                      v.hide_when_out_of_stock ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`} />
                  </button>
                </div>
                <div className="px-3 py-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Stregkoder{barcodes.length > 0 ? ` (${barcodes.length})` : ''}
                  </p>
                  <BarcodeManager
                    variant={v}
                    onUpdate={updated => onChange(variants.map((vv, vi) => vi === i ? { ...vv, variant_barcodes: updated } : vv))}
                  />
                </div>
                <EconomicsBox
                  salesPrice={v.sales_price}
                  purchasePrice={sup?.purchase_price ?? null}
                  salePrice={v.sale_price}
                  campaigns={campaigns}
                />
                <div className="px-3 py-2 border-t border-gray-100 flex justify-end">
                  <SaveVariantButton onSave={async () => {
                    await patchVariant(v, { attributes: v.attributes, sales_price: v.sales_price, sale_price: v.sale_price, weight: v.weight })
                    toggleExpand(i)
                  }} />
                </div>
              </>
            )}

            {!isOpen && (v.attributes ?? []).filter(a => a.name).length > 0 && (
              <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-1">
                {(v.attributes ?? []).filter(a => a.name).map((a, j) => (
                  <span key={j} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                    {a.name}{a.value ? `: ${a.value}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <button onClick={addAttr}
        className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg py-2 hover:border-gray-300 transition-colors">
        + Tilføj attribut til alle varianter
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export type ProductDetailMode = 'page' | 'panel'

export function ProductDetail({
  productId,
  mode = 'page',
  onClose,
  onBack,
}: {
  productId: string
  mode?: ProductDetailMode
  onClose?: () => void
  onBack?: () => void
}) {
  const [product,   setProduct]  = useState<Product | null>(null)
  const [loading,   setLoading]  = useState(true)
  const [activeImg, setActiveImg] = useState(0)
  const [error,     setError]    = useState<string | null>(null)
  const [saving,    setSaving]   = useState<Set<string>>(new Set())
  const [statusSaving, setStatusSaving] = useState(false)
  const [variants,  setVariants] = useState<Variant[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setProduct(null)
    setVariants([])
    setCampaigns([])
    setActiveImg(0)
    fetch(`/api/products/${productId}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error)
        else { setProduct(j.data); setVariants(j.data?.product_variants ?? []) }
      })
      .finally(() => setLoading(false))

    // Fetch campaigns for this product
    fetch(`/api/campaigns?product_id=${productId}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setCampaigns(j.data ?? []))
      .catch(() => {})
  }, [productId])

  async function patchField(fields: Record<string, unknown>, key?: string) {
    if (!product) return
    if (key) setSaving(s => new Set(s).add(key))
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!json.error) setProduct(p => p ? { ...p, ...fields } : p)
    if (key) setSaving(s => { const n = new Set(s); n.delete(key); return n })
  }

  async function patchStatus(status: string) {
    setStatusSaving(true)
    await patchField({ status })
    setStatusSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm py-20">Henter produkt...</div>
  )
  if (error || !product) return (
    <div className="flex items-center justify-center h-full text-red-500 text-sm py-20">{error ?? 'Produkt ikke fundet'}</div>
  )

  const images  = product.product_images.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const files   = product.product_files
  const suppls  = product.product_suppliers.slice().sort((a, b) => a.priority - b.priority)
  const ownAvailable      = product.own_stock_quantity - product.own_stock_reserved
  const totalSupplierStock = suppls.filter(s => s.is_active)
    .reduce((sum, s) => sum + Math.max(0, s.supplier_stock_quantity - s.supplier_stock_reserved), 0)

  // ── Shared header ────────────────────────────────────────────────────────────
  const header = (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
      {mode === 'page' && onBack && (
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← Tilbage</button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate leading-tight">{product.name}</h2>
          <span className="text-xs font-mono text-gray-400 shrink-0">{product.internal_sku}</span>
          {variants.length === 0 && suppls.some(s => s.variant_id) && (
            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full shrink-0">Variant</span>
          )}
        </div>
        {product.brand && <p className="text-xs text-gray-400">{product.brand}</p>}
      </div>
      <select value={product.status} onChange={e => patchStatus(e.target.value)} disabled={statusSaving}
        className={`text-xs px-2.5 py-1 rounded-full font-medium border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-60 ${STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-500'}`}>
        <option value="draft">Kladde</option>
        <option value="validated">Valideret</option>
        <option value="published">Publiceret</option>
      </select>
      {product.woo_product_id && (
        <a href={`https://kronborgmarinebaadudstyr.dk/wp-admin/post.php?post=${product.woo_product_id}&action=edit`}
          target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">
          Woo →
        </a>
      )}
      {mode === 'panel' && onClose && (
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 ml-1">×</button>
      )}
    </div>
  )

  // ── Shared sections ──────────────────────────────────────────────────────────
  const imagesSection = (
    <Section title={`Billeder (${images.length})`}>
      {images.length > 0 ? (
        <div>
          <div className="relative w-full h-52 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden mb-3">
            <Image src={images[activeImg]?.url} alt={images[activeImg]?.alt_text ?? product.name}
              fill className="object-contain" unoptimized />
            <span className="absolute top-2 right-2 text-xs bg-black/40 text-white px-2 py-0.5 rounded">
              {images[activeImg]?.source}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {images.map((img, i) => (
              <button key={img.id} onClick={() => setActiveImg(i)}
                className={`w-12 h-12 rounded-lg border-2 overflow-hidden relative bg-gray-50 transition-colors ${i === activeImg ? 'border-blue-500' : 'border-gray-200 hover:border-gray-400'}`}>
                <Image src={img.url} alt="" fill className="object-contain" unoptimized />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-28 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">
          Ingen billeder
        </div>
      )}
    </Section>
  )

  const descriptionSection = (
    <Section title="Beskrivelse">
      <dl>
        <InlineField label="Kort beskrivelse" value={product.short_description} multiline
          onSave={v => patchField({ short_description: v }, 'short_description')} saving={saving.has('short_description')} />
        <InlineField label="Beskrivelse" value={product.description} multiline
          onSave={v => patchField({ description: v }, 'description')} saving={saving.has('description')} />
        <InlineField label="Video URL" value={product.video_url}
          onSave={v => patchField({ video_url: v }, 'video_url')} saving={saving.has('video_url')} />
      </dl>
    </Section>
  )

  const variantsSection = (
    <Section title={`Varianter (${variants.length})`}>
      <VariantsEditor variants={variants} onChange={setVariants} campaigns={campaigns} />
    </Section>
  )

  const suppliersSection = (
    <Section title={`Leverandører (${suppls.length})`}>
      {suppls.length > 0 ? (
        <div className="space-y-3">
          {suppls.map(s => (
            <div key={s.id} className={`rounded-lg border p-4 ${s.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">#{s.priority}</span>
                  <span className="text-sm font-semibold text-gray-900">{s.suppliers.name}</span>
                  {!s.is_active && <span className="text-xs text-gray-400">(inaktiv)</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ITEM_STATUS_COLORS[s.item_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {s.item_status}
                </span>
              </div>
              <dl>
                <Field label="Lev. varenr."     value={s.supplier_sku} mono />
                <Field label="Lev. produktnavn" value={s.supplier_product_name} />
                <Field label="Indkøbspris"      value={s.purchase_price != null ? `${s.purchase_price.toLocaleString('da-DK')} kr` : null} />
                <Field label="Vejl. salgspris"  value={s.recommended_sales_price != null ? `${s.recommended_sales_price.toLocaleString('da-DK')} kr` : null} />
                <Field label="Leveringstid"     value={s.delivery_days_min != null ? `${s.delivery_days_min}–${s.delivery_days_max ?? s.delivery_days_min} dage` : null} />
                <Field label="Min. ordremængde" value={s.moq > 1 ? `${s.moq} stk.` : null} />
                <Field label="Lev. lager"       value={
                  <span className={s.supplier_stock_quantity > 0 ? 'text-green-700 font-medium' : 'text-gray-300'}>
                    {s.supplier_stock_quantity}
                    {s.supplier_stock_reserved > 0 && <span className="text-orange-500 ml-1 font-normal">({s.supplier_stock_reserved} res.)</span>}
                  </span>
                } />
                <Field label="Opdateret"        value={new Date(s.updated_at).toLocaleString('da-DK')} />
              </dl>
              {s.extra_data && Object.keys(s.extra_data).length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                    Ekstra data ({Object.keys(s.extra_data).length} felter)
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 bg-gray-50 rounded-lg p-3">
                    {Object.entries(s.extra_data).map(([k, val]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-xs text-gray-400 shrink-0 w-24 truncate" title={k}>{k}</dt>
                        <dd className="text-xs text-gray-700 truncate">{String(val)}</dd>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-300">Ingen leverandører tilknyttet</p>
      )}
    </Section>
  )

  const visibilitySection = (
    <Section title="Shop-synlighed">
      <div className="space-y-3">
        {/* Product-level toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Skjul ved 0 på lokalt lager</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {product.hide_when_out_of_stock
                ? product.own_stock_quantity === 0
                  ? '🚫 Skjult i shop nu — lokalt lager er 0'
                  : `👁 Lager-styret — synlig (${product.own_stock_quantity} stk. på lager)`
                : '✓ Altid synlig uanset lager'}
            </p>
          </div>
          <button
            onClick={() => patchField({ hide_when_out_of_stock: !product.hide_when_out_of_stock }, 'hide_when_out_of_stock')}
            disabled={saving.has('hide_when_out_of_stock')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              product.hide_when_out_of_stock ? 'bg-yellow-400' : 'bg-gray-200'
            }`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              product.hide_when_out_of_stock ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {product.hide_when_out_of_stock && (
          <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 border border-yellow-200">
            Produktet er aktivt synlighedsstyret. Indstil samme på varianter nedenfor hvis ønsket.
          </p>
        )}
      </div>
    </Section>
  )

  const stockSection = (
    <Section title="Lagerbeholdning">
      <div className="flex justify-between items-center pb-3 mb-2 border-b border-gray-100">
        <span className="text-sm text-gray-600">Eget lager</span>
        <span className={`text-xl font-bold tabular-nums ${product.own_stock_quantity > 0 ? 'text-green-700' : 'text-gray-400'}`}>
          {product.own_stock_quantity}
          {product.own_stock_reserved > 0 && <span className="text-sm text-orange-400 ml-1 font-normal">-{product.own_stock_reserved}</span>}
        </span>
      </div>
      {suppls.filter(s => s.is_active).map(s => (
        <div key={s.id} className="flex justify-between items-center py-1 text-xs">
          <span className="text-gray-500">{s.suppliers.name} <span className="text-gray-300">#{s.priority}</span></span>
          <span className={`font-medium tabular-nums ${s.supplier_stock_quantity > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{s.supplier_stock_quantity}</span>
        </div>
      ))}
      {suppls.length > 0 && (
        <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400">Total tilgængeligt</span>
          <span className="font-bold text-gray-900 tabular-nums text-sm">{ownAvailable + totalSupplierStock}</span>
        </div>
      )}
    </Section>
  )

  const pricesSection = (
    <Section title="Priser">
      <dl>
        <InlineField label="Salgspris" value={product.sales_price}
          displayValue={product.sales_price != null ? `${product.sales_price.toLocaleString('da-DK')} kr` : null}
          type="number" onSave={v => patchField({ sales_price: v }, 'sales_price')} saving={saving.has('sales_price')} />
        <InlineField label="Tilbudspris" value={product.sale_price}
          displayValue={product.sale_price != null ? <span className="text-red-500">{product.sale_price.toLocaleString('da-DK')} kr</span> : null}
          type="number" onSave={v => patchField({ sale_price: v }, 'sale_price')} saving={saving.has('sale_price')} />
        <InlineField label="Moms-klasse" value={product.tax_class}
          onSave={v => patchField({ tax_class: v }, 'tax_class')} saving={saving.has('tax_class')} />
      </dl>
    </Section>
  )

  const identSection = (
    <Section title="Identifikation">
      <dl>
        <Field label="Internt varenr." value={product.internal_sku} mono />
        <Field label="Bestillingsnr."  value={product.woo_bestillingsnummer} mono />
        <InlineField label="EAN / Stregkode" value={product.ean} mono
          onSave={v => patchField({ ean: v }, 'ean')} saving={saving.has('ean')} />
        <InlineField label="Producent SKU" value={product.manufacturer_sku} mono
          onSave={v => patchField({ manufacturer_sku: v }, 'manufacturer_sku')} saving={saving.has('manufacturer_sku')} />
        <InlineField label="Brand" value={product.brand}
          onSave={v => patchField({ brand: v }, 'brand')} saving={saving.has('brand')} />
        <InlineField label="Slug" value={product.slug} mono
          onSave={v => patchField({ slug: v }, 'slug')} saving={saving.has('slug')} />
      </dl>
    </Section>
  )

  const originalNumberSection = (
    <Section title="Original nummer (eksternt)">
      <OriginalNumberSelector
        product={product}
        suppliers={suppls}
        variants={variants}
        onSet={(value, source) => patchField({ original_number: value || null, original_number_source: value ? source : null }, 'original_number')}
      />
    </Section>
  )

  const dimsSection = (
    <Section title="Pakkedimensioner">
      <dl>
        <InlineField label="Vægt (kg)" value={product.weight} displayValue={product.weight != null ? `${product.weight} kg` : null}
          type="number" onSave={v => patchField({ weight: v }, 'weight')} saving={saving.has('weight')} />
        <InlineField label="Længde (cm)" value={product.length} displayValue={product.length != null ? `${product.length} cm` : null}
          type="number" onSave={v => patchField({ length: v }, 'length')} saving={saving.has('length')} />
        <InlineField label="Bredde (cm)" value={product.width} displayValue={product.width != null ? `${product.width} cm` : null}
          type="number" onSave={v => patchField({ width: v }, 'width')} saving={saving.has('width')} />
        <InlineField label="Højde (cm)" value={product.height} displayValue={product.height != null ? `${product.height} cm` : null}
          type="number" onSave={v => patchField({ height: v }, 'height')} saving={saving.has('height')} />
      </dl>
    </Section>
  )

  const catSection = (
    <Section title="Kategorier & tags">
      <dl>
        <InlineField label="Kategorier" value={(product.categories ?? []).join(', ')}
          displayValue={product.categories?.length > 0
            ? <div className="flex flex-wrap gap-1">{product.categories.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c}</span>)}</div>
            : null}
          onSave={v => patchField({ categories: v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [] }, 'categories')}
          saving={saving.has('categories')} />
        <InlineField label="Tags" value={(product.tags ?? []).join(', ')}
          displayValue={product.tags?.length > 0
            ? <div className="flex flex-wrap gap-1">{product.tags.map(t => <span key={t} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{t}</span>)}</div>
            : null}
          onSave={v => patchField({ tags: v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [] }, 'tags')}
          saving={saving.has('tags')} />
      </dl>
      {product.attributes?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-medium">Attributter</p>
          <dl>
            {product.attributes.map(a => (
              <div key={a.name} className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0 text-xs">
                <dt className="text-gray-400 w-28 shrink-0">{a.name}</dt>
                <dd className="text-gray-700">{Array.isArray(a.value) ? a.value.join(', ') : a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Section>
  )

  const metaSection = (
    <>
      {product.manufacturers && (
        <Section title="Producent">
          <dl>
            <Field label="Navn"    value={product.manufacturers.name} />
            <Field label="Land"    value={product.manufacturers.country} />
            <Field label="Website" value={product.manufacturers.website
              ? <a href={product.manufacturers.website} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs truncate block">{product.manufacturers.website}</a>
              : null} />
          </dl>
        </Section>
      )}
      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <Section title="Specifikationer">
          <dl>{Object.entries(product.specifications).map(([k, val]) => <Field key={k} label={k} value={String(val)} />)}</dl>
        </Section>
      )}
      <Section title="SEO">
        <dl>
          <InlineField label="Meta-titel" value={product.meta_title}
            onSave={v => patchField({ meta_title: v }, 'meta_title')} saving={saving.has('meta_title')} />
          <InlineField label="Meta-beskrivelse" value={product.meta_description} multiline
            onSave={v => patchField({ meta_description: v }, 'meta_description')} saving={saving.has('meta_description')} />
        </dl>
      </Section>
      <Section title="WooCommerce">
        <dl>
          <Field label="Woo produkt-ID" value={product.woo_product_id} />
          <Field label="Sync status"    value={product.woo_sync_status} />
          <Field label="Sidst synkret"  value={product.last_synced_woo_at ? new Date(product.last_synced_woo_at).toLocaleString('da-DK') : null} />
          <Field label="Bestillingsnr." value={product.woo_bestillingsnummer} mono />
        </dl>
      </Section>
      <Section title="POS (admind)">
        <dl>
          <Field label="POS produkt-ID" value={product.pos_product_id} mono />
          <Field label="Sidst synkret"  value={product.last_synced_pos_at ? new Date(product.last_synced_pos_at).toLocaleString('da-DK') : null} />
        </dl>
      </Section>
      <Section title="Registrering">
        <dl>
          <Field label="Produkt-ID" value={product.id} mono />
          <Field label="Oprettet"   value={new Date(product.created_at).toLocaleString('da-DK')} />
          <Field label="Opdateret"  value={new Date(product.updated_at).toLocaleString('da-DK')} />
        </dl>
      </Section>
    </>
  )

  const hint = (
    <div className="bg-white border-t border-gray-100 px-4 py-2 text-xs text-gray-300 text-center shrink-0">
      Klik på et felt for at redigere — gemmes automatisk
    </div>
  )

  // ── Panel mode: single-column, slides in from right ──────────────────────────
  if (mode === 'panel') {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {header}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {imagesSection}
            {descriptionSection}
            {variantsSection}
            {suppliersSection}
            {visibilitySection}
            {stockSection}
            {pricesSection}
            {identSection}
            {originalNumberSection}
            {dimsSection}
            {catSection}
            {metaSection}
            {files.length > 0 && (
              <Section title={`Filer & manualer (${files.length})`}>
                <div className="space-y-1.5">
                  {files.map(f => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline py-1">
                      <span className="text-base">📄</span>
                      <span className="font-medium">{f.file_name}</span>
                      <span className="text-xs text-gray-400">({f.file_type} · {f.language})</span>
                    </a>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
        {hint}
      </div>
    )
  }

  // ── Page mode: 3-column grid ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 grid grid-cols-3 gap-4 max-w-7xl">
          <div className="col-span-2 space-y-4">
            {imagesSection}
            {descriptionSection}
            {variantsSection}
            {suppliersSection}
            {files.length > 0 && (
              <Section title={`Filer & manualer (${files.length})`}>
                <div className="space-y-1.5">
                  {files.map(f => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline py-1">
                      <span className="text-base">📄</span>
                      <span className="font-medium">{f.file_name}</span>
                      <span className="text-xs text-gray-400">({f.file_type} · {f.language} · {f.source})</span>
                    </a>
                  ))}
                </div>
              </Section>
            )}
          </div>
          <div className="space-y-4">
            {visibilitySection}
            {stockSection}
            {pricesSection}
            {identSection}
            {originalNumberSection}
            {product.manufacturers && (
              <Section title="Producent">
                <dl>
                  <Field label="Navn"    value={product.manufacturers.name} />
                  <Field label="Land"    value={product.manufacturers.country} />
                  <Field label="Website" value={product.manufacturers.website
                    ? <a href={product.manufacturers.website} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate block">{product.manufacturers.website}</a>
                    : null} />
                </dl>
              </Section>
            )}
            {dimsSection}
            {catSection}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <Section title="Specifikationer">
                <dl>{Object.entries(product.specifications).map(([k, val]) => <Field key={k} label={k} value={String(val)} />)}</dl>
              </Section>
            )}
            <Section title="SEO">
              <dl>
                <InlineField label="Meta-titel" value={product.meta_title}
                  onSave={v => patchField({ meta_title: v }, 'meta_title')} saving={saving.has('meta_title')} />
                <InlineField label="Meta-beskrivelse" value={product.meta_description} multiline
                  onSave={v => patchField({ meta_description: v }, 'meta_description')} saving={saving.has('meta_description')} />
              </dl>
            </Section>
            <Section title="WooCommerce">
              <dl>
                <Field label="Woo produkt-ID" value={product.woo_product_id} />
                <Field label="Sync status"    value={product.woo_sync_status} />
                <Field label="Sidst synkret"  value={product.last_synced_woo_at ? new Date(product.last_synced_woo_at).toLocaleString('da-DK') : null} />
                <Field label="Bestillingsnr." value={product.woo_bestillingsnummer} mono />
              </dl>
            </Section>
            <Section title="POS (admind)">
              <dl>
                <Field label="POS produkt-ID" value={product.pos_product_id} mono />
                <Field label="Sidst synkret"  value={product.last_synced_pos_at ? new Date(product.last_synced_pos_at).toLocaleString('da-DK') : null} />
              </dl>
            </Section>
            <Section title="Registrering">
              <dl>
                <Field label="Produkt-ID" value={product.id} mono />
                <Field label="Oprettet"   value={new Date(product.created_at).toLocaleString('da-DK')} />
                <Field label="Opdateret"  value={new Date(product.updated_at).toLocaleString('da-DK')} />
              </dl>
            </Section>
          </div>
        </div>
      </div>
      {hint}
    </div>
  )
}
