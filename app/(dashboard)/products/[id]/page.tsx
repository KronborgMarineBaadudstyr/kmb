'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'

type Supplier = { id: string; name: string; contact_email: string | null; data_format: string | null }
type ProductSupplier = {
  id: string; priority: number; is_active: boolean
  variant_id: string | null
  supplier_sku: string; supplier_product_name: string | null
  purchase_price: number | null; recommended_sales_price: number | null
  delivery_days_min: number | null; delivery_days_max: number | null
  moq: number; supplier_stock_quantity: number; supplier_stock_reserved: number
  item_status: string; supplier_images: unknown; supplier_files: unknown
  extra_data: Record<string, unknown> | null
  updated_at: string; suppliers: Supplier
}
type Variant = {
  id: string; internal_variant_sku: string
  attributes: { name: string; value: string }[]
  own_stock_quantity: number; own_stock_reserved: number
  sales_price: number | null; sale_price: number | null; ean: string | null
  weight: number | null
  woo_variation_id: number | null; status: string
  // supplier linked to this specific variant (via product_suppliers.variant_id)
  supplier?: {
    name: string; supplier_sku: string
    purchase_price: number | null
    supplier_stock_quantity: number
    image_url?: string | null
  }
}
type ProductImage = { id: string; url: string; alt_text: string | null; is_primary: boolean; position: number; source: string; storage_path: string | null }
type ProductFile  = { id: string; url: string; file_name: string; file_type: string; language: string; position: number; source: string }
type Product = {
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
  created_at: string
  updated_at: string
  last_synced_woo_at: string | null
  last_synced_pos_at: string | null
  manufacturers: { id: string; name: string; country: string | null; website: string | null } | null
  product_images: ProductImage[]
  product_files: ProductFile[]
  product_variants: Variant[]
  product_suppliers: ProductSupplier[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  validated: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Kladde', validated: 'Valideret', published: 'Publiceret',
}
const ITEM_STATUS_COLORS: Record<string, string> = {
  active:        'bg-green-50 text-green-700',
  new:           'bg-blue-50 text-blue-700',
  price_changed: 'bg-yellow-50 text-yellow-700',
  discontinued:  'bg-red-50 text-red-700',
  out_of_stock:  'bg-orange-50 text-orange-700',
}

// ─── Inline editable field ───────────────────────────────────────────────────
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
    if (e.key === 'Escape') { setEditing(false) }
  }

  const isEmpty = value === null || value === undefined || value === ''

  const inputCls = 'w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0 group">
      <dt className="w-32 shrink-0 text-xs text-gray-400 pt-0.5 leading-5">{label}</dt>
      <dd className="flex-1 min-w-0">
        {editing ? (
          options ? (
            <select
              ref={inputRef as React.Ref<HTMLSelectElement>}
              className={inputCls}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
            >
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : multiline ? (
            <textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              className={inputCls + ' resize-y'}
              rows={4}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
            />
          ) : (
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type={type}
              className={inputCls + (mono ? ' font-mono text-xs' : '')}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKey}
            />
          )
        ) : (
          <button
            onClick={openEdit}
            className={`text-left w-full text-sm leading-5 rounded px-1 -mx-1 py-0.5 hover:bg-blue-50 transition-colors ${
              isEmpty ? 'text-gray-300' : mono ? 'font-mono text-xs text-gray-700' : 'text-gray-900'
            } ${saving ? 'opacity-60' : ''}`}
            title="Klik for at redigere"
          >
            {saving ? (
              <span className="text-blue-400">Gemmer...</span>
            ) : displayValue ?? (isEmpty ? '—' : String(value))}
          </button>
        )}
      </dd>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────
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

// ─── Read-only field ─────────────────────────────────────────────────────────
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

// ─── Variant editor — card-based, matches staging LinkVariantsPanel ───────────
function VariantsEditor({
  variants,
  onChange,
}: {
  variants: Variant[]
  onChange: (updated: Variant[]) => void
}) {
  const [savingId,     setSavingId]     = useState<string | null>(null)
  const [expandedIdxs, setExpandedIdxs] = useState<Set<number>>(new Set())

  async function patchVariant(variant: Variant, fields: Partial<Variant>) {
    setSavingId(variant.id)
    await fetch(`/api/products/variants/${variant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    onChange(variants.map(v => v.id === variant.id ? { ...v, ...fields } : v))
    setSavingId(null)
  }

  // Attribute helpers — key changes sync across ALL variants; value only changes current
  function setAttr(variantIdx: number, attrIdx: number, field: 'name' | 'value', val: string) {
    const updated = variants.map((v, vi) => {
      if (vi === variantIdx) {
        return { ...v, attributes: v.attributes.map((a, ai) => ai === attrIdx ? { ...a, [field]: val } : a) }
      }
      if (field === 'name' && attrIdx < v.attributes.length) {
        return { ...v, attributes: v.attributes.map((a, ai) => ai === attrIdx ? { ...a, name: val } : a) }
      }
      return v
    })
    onChange(updated)
    // Save only the variant that changed (key sync saves on blur via individual patchVariant calls)
  }

  function saveAttr(variantIdx: number) {
    patchVariant(variants[variantIdx], { attributes: variants[variantIdx].attributes })
  }

  function addAttr() {
    // Add empty attr to ALL variants
    const updated = variants.map(v => ({ ...v, attributes: [...(v.attributes ?? []), { name: '', value: '' }] }))
    onChange(updated)
    // No save yet — user fills in the values
  }

  function removeAttr(attrIdx: number) {
    const updated = variants.map(v => {
      const attrs = (v.attributes ?? []).filter((_, ai) => ai !== attrIdx)
      fetch(`/api/products/variants/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: attrs }),
      })
      return { ...v, attributes: attrs }
    })
    onChange(updated)
  }

  function toggleExpand(i: number) {
    setExpandedIdxs(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }
  function autoExpand(i: number) {
    setExpandedIdxs(prev => { if (prev.has(i)) return prev; const n = new Set(prev); n.add(i); return n })
  }

  if (variants.length === 0) {
    return <p className="text-sm text-gray-300">Ingen varianter — simpelt produkt</p>
  }

  const inputCls = 'flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400'

  return (
    <div className="space-y-3">
      {variants.map((v, i) => {
        const isSaving     = savingId === v.id
        const isOpen       = expandedIdxs.has(i)
        const sup          = v.supplier
        const totalStock   = v.own_stock_quantity + (sup?.supplier_stock_quantity ?? 0)

        return (
          <div
            key={v.id}
            className={`border rounded-lg overflow-hidden transition-colors ${isSaving ? 'border-blue-200' : 'border-gray-200'}`}
          >
            {/* ── Card header: always visible ── */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              {/* Supplier image if available */}
              {sup?.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sup.image_url} alt="" className="w-9 h-9 object-contain rounded border border-gray-200 bg-white shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                {/* SKU + supplier name */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500 shrink-0">
                    {v.internal_variant_sku}
                  </span>
                  {sup && (
                    <span className="text-xs font-medium text-gray-700 truncate">{sup.name}</span>
                  )}
                  {sup?.supplier_sku && (
                    <span className="font-mono text-xs text-gray-400">{sup.supplier_sku}</span>
                  )}
                </div>

                {/* Price + stock row */}
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {sup?.purchase_price != null && (
                    <span className="text-xs text-gray-400">Indkøb: <span className="text-gray-600 font-medium">{sup.purchase_price.toLocaleString('da-DK')} kr</span></span>
                  )}
                  {v.sales_price != null && (
                    <span className="text-xs text-gray-400">Salg: <span className="text-gray-700 font-medium">{v.sales_price.toLocaleString('da-DK')} kr</span></span>
                  )}
                  <span className={`text-xs font-medium ${totalStock > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                    Lager: {totalStock} stk
                  </span>
                  {v.ean && (
                    <span className="text-xs text-gray-400 font-mono">{v.ean}</span>
                  )}
                </div>
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => toggleExpand(i)}
                className="text-xs text-gray-400 hover:text-gray-600 shrink-0 px-1.5 py-1"
                title={isOpen ? 'Skjul' : 'Rediger'}
              >
                {isOpen ? '▲' : '▼'}
              </button>
            </div>

            {/* ── Expanded: editable fields ── */}
            {isOpen && (
              <>
                {/* Attributes */}
                <div className="px-3 py-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attributter</p>
                  {(v.attributes ?? []).map((a, j) => (
                    <div key={j} className="flex gap-1.5 items-center">
                      <input
                        placeholder="størrelse"
                        value={a.name}
                        onChange={e => setAttr(i, j, 'name', e.target.value)}
                        onBlur={() => saveAttr(i)}
                        className={inputCls}
                      />
                      <span className="text-gray-300 text-xs">=</span>
                      <input
                        placeholder="3 mm"
                        value={a.value}
                        onChange={e => setAttr(i, j, 'value', e.target.value)}
                        onBlur={() => saveAttr(i)}
                        className={inputCls}
                      />
                      <button
                        onClick={() => removeAttr(j)}
                        className="text-gray-300 hover:text-red-400 text-base leading-none shrink-0"
                      >×</button>
                    </div>
                  ))}
                  <button onClick={addAttr} className="text-xs text-blue-500 hover:underline">+ Attribut</button>
                </div>

                {/* Editable numeric fields */}
                <div className="px-3 py-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Salgspris (kr)</label>
                    <NumericInput
                      value={v.sales_price}
                      suffix=" kr"
                      onSave={val => patchVariant(v, { sales_price: val })}
                      placeholder="Pris"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tilbudspris (kr)</label>
                    <NumericInput
                      value={v.sale_price}
                      suffix=" kr"
                      onSave={val => patchVariant(v, { sale_price: val })}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">EAN</label>
                    <AttrValueInput
                      value={v.ean ?? ''}
                      placeholder="Stregkode"
                      onSave={val => patchVariant(v, { ean: val || null })}
                      mono
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Vægt (kg)</label>
                    <NumericInput
                      value={v.weight ?? null}
                      suffix=" kg"
                      onSave={val => patchVariant(v, { weight: val as number | null })}
                      placeholder="—"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Attribute pills — visible when collapsed, shows what's filled in */}
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

      {/* Global "add attribute to all" shortcut */}
      <button
        onClick={addAttr}
        className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg py-2 hover:border-gray-300 transition-colors"
      >
        + Tilføj attribut til alle varianter
      </button>
    </div>
  )
}

function AttrValueInput({
  value, onSave, placeholder, mono,
}: {
  value: string; onSave: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  function open() { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 0) }
  function commit() { setEditing(false); if (draft !== value) onSave(draft) }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        placeholder={placeholder}
        className={`px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white w-full ${mono ? 'font-mono' : ''}`}
      />
    )
  }
  return (
    <button
      onClick={open}
      className={`text-left w-full px-2 py-1 text-xs rounded hover:bg-blue-50 transition-colors ${
        value ? (mono ? 'font-mono text-gray-700' : 'text-gray-900') : 'text-gray-300'
      }`}
    >
      {value || placeholder || '—'}
    </button>
  )
}

function NumericInput({
  value, onSave, suffix, placeholder,
}: {
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

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        placeholder={placeholder}
        className="px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white w-full"
      />
    )
  }
  return (
    <button
      onClick={open}
      className={`text-left w-full px-2 py-1 text-xs rounded hover:bg-blue-50 transition-colors ${
        value != null ? 'text-gray-900 font-medium' : 'text-gray-300'
      }`}
    >
      {value != null ? `${value.toLocaleString('da-DK')}${suffix ?? ''}` : placeholder ?? '—'}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id }                    = useParams<{ id: string }>()
  const router                    = useRouter()
  const [product, setProduct]     = useState<Product | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeImg, setActiveImg] = useState(0)
  const [error, setError]         = useState<string | null>(null)
  const [saving, setSaving]       = useState<Set<string>>(new Set())
  const [statusSaving, setStatusSaving] = useState(false)
  const [variants, setVariants]   = useState<Variant[]>([])

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error)
        else {
          setProduct(j.data)
          setVariants(j.data?.product_variants ?? [])
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  async function patchField(fields: Record<string, unknown>, key?: string) {
    if (!product) return
    if (key) setSaving(s => new Set(s).add(key))
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!json.error) {
      setProduct(p => p ? { ...p, ...fields } : p)
    }
    if (key) setSaving(s => { const n = new Set(s); n.delete(key); return n })
  }

  async function patchStatus(status: string) {
    setStatusSaving(true)
    await patchField({ status })
    setStatusSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Henter produkt...
    </div>
  )
  if (error || !product) return (
    <div className="flex items-center justify-center h-full text-red-500 text-sm">
      {error ?? 'Produkt ikke fundet'}
    </div>
  )

  const images = product.product_images.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const files  = product.product_files
  const suppls = product.product_suppliers.slice().sort((a, b) => a.priority - b.priority)

  const totalSupplierStock = suppls
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + Math.max(0, s.supplier_stock_quantity - s.supplier_stock_reserved), 0)
  const ownAvailable = product.own_stock_quantity - product.own_stock_reserved

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 text-sm shrink-0"
        >
          ← Tilbage
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate leading-tight">{product.name}</h2>
            <span className="text-xs font-mono text-gray-400 shrink-0">{product.internal_sku}</span>
            {variants.length === 0 && suppls.some(s => s.variant_id) && (
              <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full shrink-0">Variant</span>
            )}
          </div>
          {product.brand && (
            <p className="text-xs text-gray-400">{product.brand}</p>
          )}
        </div>

        {/* Status selector */}
        <select
          value={product.status}
          onChange={e => patchStatus(e.target.value)}
          disabled={statusSaving}
          className={`text-xs px-2.5 py-1 rounded-full font-medium border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-60 ${
            STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-500'
          }`}
        >
          <option value="draft">Kladde</option>
          <option value="validated">Valideret</option>
          <option value="published">Publiceret</option>
        </select>

        {product.woo_product_id && (
          <a
            href={`https://kronborgmarinebaadudstyr.dk/wp-admin/post.php?post=${product.woo_product_id}&action=edit`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline shrink-0"
          >
            Se i Woo →
          </a>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 grid grid-cols-3 gap-4 max-w-7xl">

          {/* ── Venstre + Midt ───────────────────────────────────────────── */}
          <div className="col-span-2 space-y-4">

            {/* Billeder */}
            <Section title={`Billeder (${images.length})`}>
              {images.length > 0 ? (
                <div>
                  <div className="relative w-full h-64 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden mb-3">
                    <Image
                      src={images[activeImg]?.url}
                      alt={images[activeImg]?.alt_text ?? product.name}
                      fill className="object-contain" unoptimized
                    />
                    <span className="absolute top-2 right-2 text-xs bg-black/40 text-white px-2 py-0.5 rounded">
                      {images[activeImg]?.source}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {images.map((img, i) => (
                      <button key={img.id} onClick={() => setActiveImg(i)}
                        className={`w-14 h-14 rounded-lg border-2 overflow-hidden relative bg-gray-50 transition-colors ${
                          i === activeImg ? 'border-blue-500' : 'border-gray-200 hover:border-gray-400'
                        }`}>
                        <Image src={img.url} alt="" fill className="object-contain" unoptimized />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-36 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">
                  Ingen billeder
                </div>
              )}
            </Section>

            {/* Beskrivelse */}
            <Section title="Beskrivelse">
              <dl>
                <InlineField
                  label="Kort beskrivelse"
                  value={product.short_description}
                  multiline
                  onSave={v => patchField({ short_description: v }, 'short_description')}
                  saving={saving.has('short_description')}
                />
                <InlineField
                  label="Beskrivelse"
                  value={product.description}
                  multiline
                  onSave={v => patchField({ description: v }, 'description')}
                  saving={saving.has('description')}
                />
                <InlineField
                  label="Video URL"
                  value={product.video_url}
                  onSave={v => patchField({ video_url: v }, 'video_url')}
                  saving={saving.has('video_url')}
                />
              </dl>
            </Section>

            {/* Varianter */}
            <Section title={`Varianter (${variants.length})`}>
              <VariantsEditor variants={variants} onChange={setVariants} />
            </Section>

            {/* Leverandører */}
            <Section title={`Leverandører (${suppls.length})`}>
              {suppls.length > 0 ? (
                <div className="space-y-3">
                  {suppls.map(s => (
                    <div
                      key={s.id}
                      className={`rounded-lg border p-4 ${s.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}
                    >
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
                            {Object.entries(s.extra_data).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <dt className="text-xs text-gray-400 shrink-0 w-24 truncate" title={k}>{k}</dt>
                                <dd className="text-xs text-gray-700 truncate">{String(v)}</dd>
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

            {/* Filer */}
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

          {/* ── Højre kolonne ────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Lagerbeholdning */}
            <Section title="Lagerbeholdning">
              <div className="flex justify-between items-center pb-3 mb-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Eget lager</span>
                <span className={`text-xl font-bold tabular-nums ${product.own_stock_quantity > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                  {product.own_stock_quantity}
                  {product.own_stock_reserved > 0 && (
                    <span className="text-sm text-orange-400 ml-1 font-normal">-{product.own_stock_reserved}</span>
                  )}
                </span>
              </div>
              {suppls.filter(s => s.is_active).map(s => (
                <div key={s.id} className="flex justify-between items-center py-1 text-xs">
                  <span className="text-gray-500">{s.suppliers.name} <span className="text-gray-300">#{s.priority}</span></span>
                  <span className={`font-medium tabular-nums ${s.supplier_stock_quantity > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                    {s.supplier_stock_quantity}
                  </span>
                </div>
              ))}
              {suppls.length > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Total tilgængeligt</span>
                  <span className="font-bold text-gray-900 tabular-nums text-sm">{ownAvailable + totalSupplierStock}</span>
                </div>
              )}
            </Section>

            {/* Priser */}
            <Section title="Priser">
              <dl>
                <InlineField
                  label="Salgspris"
                  value={product.sales_price}
                  displayValue={product.sales_price != null ? `${product.sales_price.toLocaleString('da-DK')} kr` : null}
                  type="number"
                  onSave={v => patchField({ sales_price: v }, 'sales_price')}
                  saving={saving.has('sales_price')}
                />
                <InlineField
                  label="Tilbudspris"
                  value={product.sale_price}
                  displayValue={product.sale_price != null ? <span className="text-red-500">{product.sale_price.toLocaleString('da-DK')} kr</span> : null}
                  type="number"
                  onSave={v => patchField({ sale_price: v }, 'sale_price')}
                  saving={saving.has('sale_price')}
                />
                <InlineField
                  label="Moms-klasse"
                  value={product.tax_class}
                  onSave={v => patchField({ tax_class: v }, 'tax_class')}
                  saving={saving.has('tax_class')}
                />
              </dl>
            </Section>

            {/* Identifikation */}
            <Section title="Identifikation">
              <dl>
                <Field label="Internt varenr." value={product.internal_sku} mono />
                <Field label="Bestillingsnr."  value={product.woo_bestillingsnummer} mono />
                <InlineField
                  label="EAN / Stregkode"
                  value={product.ean}
                  mono
                  onSave={v => patchField({ ean: v }, 'ean')}
                  saving={saving.has('ean')}
                />
                <InlineField
                  label="Producent SKU"
                  value={product.manufacturer_sku}
                  mono
                  onSave={v => patchField({ manufacturer_sku: v }, 'manufacturer_sku')}
                  saving={saving.has('manufacturer_sku')}
                />
                <InlineField
                  label="Brand"
                  value={product.brand}
                  onSave={v => patchField({ brand: v }, 'brand')}
                  saving={saving.has('brand')}
                />
                <InlineField
                  label="Slug"
                  value={product.slug}
                  mono
                  onSave={v => patchField({ slug: v }, 'slug')}
                  saving={saving.has('slug')}
                />
              </dl>
            </Section>

            {/* Producent */}
            {product.manufacturers && (
              <Section title="Producent">
                <dl>
                  <Field label="Navn"    value={product.manufacturers.name} />
                  <Field label="Land"    value={product.manufacturers.country} />
                  <Field label="Website" value={
                    product.manufacturers.website
                      ? <a href={product.manufacturers.website} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs truncate block">
                          {product.manufacturers.website}
                        </a>
                      : null
                  } />
                </dl>
              </Section>
            )}

            {/* Mål & fragt */}
            <Section title="Mål & fragt">
              <dl>
                <InlineField label="Vægt (kg)"   value={product.weight}
                  displayValue={product.weight != null ? `${product.weight} kg` : null}
                  type="number"
                  onSave={v => patchField({ weight: v }, 'weight')} saving={saving.has('weight')} />
                <InlineField label="Længde (cm)"  value={product.length}
                  displayValue={product.length != null ? `${product.length} cm` : null}
                  type="number"
                  onSave={v => patchField({ length: v }, 'length')} saving={saving.has('length')} />
                <InlineField label="Bredde (cm)"  value={product.width}
                  displayValue={product.width != null ? `${product.width} cm` : null}
                  type="number"
                  onSave={v => patchField({ width: v }, 'width')} saving={saving.has('width')} />
                <InlineField label="Højde (cm)"   value={product.height}
                  displayValue={product.height != null ? `${product.height} cm` : null}
                  type="number"
                  onSave={v => patchField({ height: v }, 'height')} saving={saving.has('height')} />
              </dl>
            </Section>

            {/* Kategorier & tags */}
            <Section title="Kategorier & tags">
              <dl>
                <InlineField
                  label="Kategorier"
                  value={(product.categories ?? []).join(', ')}
                  displayValue={
                    product.categories?.length > 0
                      ? <div className="flex flex-wrap gap-1">{product.categories.map(c =>
                          <span key={c} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c}</span>
                        )}</div>
                      : null
                  }
                  onSave={v => patchField({ categories: v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [] }, 'categories')}
                  saving={saving.has('categories')}
                />
                <InlineField
                  label="Tags"
                  value={(product.tags ?? []).join(', ')}
                  displayValue={
                    product.tags?.length > 0
                      ? <div className="flex flex-wrap gap-1">{product.tags.map(t =>
                          <span key={t} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{t}</span>
                        )}</div>
                      : null
                  }
                  onSave={v => patchField({ tags: v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [] }, 'tags')}
                  saving={saving.has('tags')}
                />
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

            {/* Specifikationer */}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <Section title="Specifikationer">
                <dl>
                  {Object.entries(product.specifications).map(([k, v]) => (
                    <Field key={k} label={k} value={String(v)} />
                  ))}
                </dl>
              </Section>
            )}

            {/* SEO */}
            <Section title="SEO">
              <dl>
                <InlineField
                  label="Meta-titel"
                  value={product.meta_title}
                  onSave={v => patchField({ meta_title: v }, 'meta_title')}
                  saving={saving.has('meta_title')}
                />
                <InlineField
                  label="Meta-beskrivelse"
                  value={product.meta_description}
                  multiline
                  onSave={v => patchField({ meta_description: v }, 'meta_description')}
                  saving={saving.has('meta_description')}
                />
              </dl>
            </Section>

            {/* WooCommerce */}
            <Section title="WooCommerce">
              <dl>
                <Field label="Woo produkt-ID" value={product.woo_product_id} />
                <Field label="Sync status"    value={product.woo_sync_status} />
                <Field label="Sidst synkret"  value={product.last_synced_woo_at ? new Date(product.last_synced_woo_at).toLocaleString('da-DK') : null} />
                <Field label="Bestillingsnr." value={product.woo_bestillingsnummer} mono />
              </dl>
            </Section>

            {/* POS */}
            <Section title="POS (admind)">
              <dl>
                <Field label="POS produkt-ID" value={product.pos_product_id} mono />
                <Field label="Sidst synkret"  value={product.last_synced_pos_at ? new Date(product.last_synced_pos_at).toLocaleString('da-DK') : null} />
              </dl>
            </Section>

            {/* Registrering */}
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

      {/* Inline edit hint */}
      <div className="bg-white border-t border-gray-100 px-6 py-2 text-xs text-gray-300 text-center shrink-0">
        Klik på et felt for at redigere — gemmes automatisk
      </div>
    </div>
  )
}
