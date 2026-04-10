'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type Supplier = { id: string; name: string; contact_email: string | null; data_format: string | null }
type ProductSupplier = {
  id: string; priority: number; is_active: boolean
  supplier_sku: string; supplier_product_name: string | null
  purchase_price: number | null; recommended_sales_price: number | null
  delivery_days_min: number | null; delivery_days_max: number | null
  moq: number; supplier_stock_quantity: number; supplier_stock_reserved: number
  item_status: string; supplier_images: unknown; supplier_files: unknown
  extra_data: Record<string, unknown> | null
  updated_at: string; suppliers: Supplier
}
type Variant = {
  id: string; internal_variant_sku: string; attributes: {name:string;value:string}[]
  own_stock_quantity: number; own_stock_reserved: number
  sales_price: number | null; sale_price: number | null; ean: string | null
  woo_variation_id: number | null; status: string
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
  attributes: {name:string;value:string|string[]}[]
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
  draft:     'bg-gray-100 text-gray-600',
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

// Always-visible row — shows "—" when value is null/empty
function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const isEmpty = value === null || value === undefined || value === ''
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="w-36 shrink-0 text-xs text-gray-400 pt-0.5">{label}</dt>
      <dd className={`text-sm flex-1 ${isEmpty ? 'text-gray-300' : 'text-gray-900'} ${mono ? 'font-mono text-xs' : ''}`}>
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-1">{title}</h3>
  )
}

export default function ProductDetailPage() {
  const { id }                  = useParams<{ id: string }>()
  const router                  = useRouter()
  const [product, setProduct]   = useState<Product | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activeImg, setActiveImg] = useState(0)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) setError(j.error)
        else setProduct(j.data)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-gray-400">Henter produkt...</div>
  if (error || !product) return <div className="p-8 text-red-500">{error ?? 'Produkt ikke fundet'}</div>

  const images   = product.product_images
  const files    = product.product_files
  const variants = product.product_variants
  const suppls   = product.product_suppliers

  const totalSupplierStock = suppls
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + (s.supplier_stock_quantity - s.supplier_stock_reserved), 0)

  const ownAvailable = product.own_stock_quantity - product.own_stock_reserved

  return (
    <div className="min-h-full bg-gray-50">
      {/* Topbar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Tilbage</button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 leading-tight">{product.name}</h2>
          <p className="text-xs text-gray-400 font-mono">{product.internal_sku}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[product.status] ?? product.status}
        </span>
        {product.woo_product_id && (
          <a
            href={`https://kronborgmarinebaadudstyr.dk/wp-admin/post.php?post=${product.woo_product_id}&action=edit`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Se i Woo →
          </a>
        )}
      </div>

      <div className="p-6 grid grid-cols-3 gap-5 max-w-7xl">

        {/* ── Venstre kolonne ── */}
        <div className="col-span-2 space-y-4">

          {/* Billeder */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Billeder ({images.length})</h3>
            {images.length > 0 ? (
              <div>
                <div className="relative w-full h-72 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden mb-3">
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
                      className={`w-14 h-14 rounded border-2 overflow-hidden relative bg-gray-50 transition-colors ${
                        i === activeImg ? 'border-blue-500' : 'border-gray-200 hover:border-gray-400'
                      }`}>
                      <Image src={img.url} alt="" fill className="object-contain" unoptimized />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                Ingen billeder
              </div>
            )}
          </div>

          {/* Beskrivelse */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Beskrivelse</h3>
            {product.short_description ? (
              <div className="text-sm text-gray-700 font-medium mb-3"
                dangerouslySetInnerHTML={{ __html: product.short_description }} />
            ) : (
              <p className="text-sm text-gray-300 mb-3">Ingen kort beskrivelse</p>
            )}
            {product.description ? (
              <div className="text-sm text-gray-600 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: product.description }} />
            ) : (
              <p className="text-sm text-gray-300">Ingen beskrivelse</p>
            )}
          </div>

          {/* Varianter */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Varianter ({variants.length})</h3>
            {variants.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs text-gray-400 font-medium">Variant SKU</th>
                    <th className="text-left py-2 pr-3 text-xs text-gray-400 font-medium">Attributter</th>
                    <th className="text-right py-2 pr-3 text-xs text-gray-400 font-medium">Salgspris</th>
                    <th className="text-right py-2 pr-3 text-xs text-gray-400 font-medium">Tilbudspris</th>
                    <th className="text-right py-2 pr-3 text-xs text-gray-400 font-medium">Lager</th>
                    <th className="text-left py-2 pr-3 text-xs text-gray-400 font-medium">EAN</th>
                    <th className="text-right py-2 pr-3 text-xs text-gray-400 font-medium">Woo ID</th>
                    <th className="text-left py-2 text-xs text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map(v => (
                    <tr key={v.id}>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-600">{v.internal_variant_sku}</td>
                      <td className="py-2 pr-3">
                        {v.attributes.map(a => (
                          <span key={a.name} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1">
                            {a.name}: {a.value}
                          </span>
                        ))}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs">
                        {v.sales_price != null ? `${v.sales_price.toLocaleString('da-DK')} kr` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs">
                        {v.sale_price != null ? <span className="text-red-600">{v.sale_price.toLocaleString('da-DK')} kr</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`py-2 pr-3 text-right font-medium tabular-nums text-xs ${v.own_stock_quantity > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {v.own_stock_quantity}
                        {v.own_stock_reserved > 0 && <span className="text-orange-400 ml-1">(-{v.own_stock_reserved})</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-500">
                        {v.ean ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-xs text-gray-500">
                        {v.woo_variation_id ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${v.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-300">Ingen varianter — simpelt produkt</p>
            )}
          </div>

          {/* Leverandører */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Leverandører ({suppls.length})</h3>
            {suppls.length > 0 ? (
              <div className="space-y-4">
                {suppls.map(s => (
                  <div key={s.id} className={`border rounded-lg p-4 ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">#{s.priority}</span>
                        <span className="text-sm font-medium text-gray-900">{s.suppliers.name}</span>
                        {!s.is_active && <span className="text-xs text-gray-400">(inaktiv)</span>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ITEM_STATUS_COLORS[s.item_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {s.item_status}
                      </span>
                    </div>
                    <dl>
                      <Row label="Lev. varenr."      value={s.supplier_sku} mono />
                      <Row label="Lev. produktnavn"  value={s.supplier_product_name} />
                      <Row label="Indkøbspris"       value={s.purchase_price != null ? `${s.purchase_price.toLocaleString('da-DK')} kr` : null} />
                      <Row label="Vejl. salgspris"   value={s.recommended_sales_price != null ? `${s.recommended_sales_price.toLocaleString('da-DK')} kr` : null} />
                      <Row label="Leveringstid"      value={s.delivery_days_min != null ? `${s.delivery_days_min}–${s.delivery_days_max ?? s.delivery_days_min} dage` : null} />
                      <Row label="Min. ordremængde"  value={s.moq > 1 ? `${s.moq} stk.` : s.moq === 1 ? '1 stk.' : null} />
                      <Row label="Lev. lager"        value={
                        <span className={s.supplier_stock_quantity > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>
                          {s.supplier_stock_quantity}
                          {s.supplier_stock_reserved > 0 && <span className="text-orange-500 ml-1">({s.supplier_stock_reserved} res.)</span>}
                        </span>
                      } />
                      <Row label="Opdateret"         value={new Date(s.updated_at).toLocaleString('da-DK')} />
                    </dl>
                    {s.extra_data && Object.keys(s.extra_data).length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                          Ekstra leverandørdata ({Object.keys(s.extra_data).length} felter)
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 bg-gray-50 rounded p-3">
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
          </div>

          {/* Filer */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Filer & manualer ({files.length})</h3>
            {files.length > 0 ? (
              <div className="space-y-2">
                {files.map(f => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <span>📄</span>
                    <span>{f.file_name}</span>
                    <span className="text-xs text-gray-400">({f.file_type} · {f.language} · {f.source})</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-300">Ingen filer</p>
            )}
          </div>
        </div>

        {/* ── Højre kolonne: Alle produktfelter ── */}
        <div className="space-y-4">

          {/* Lagerbeholdning */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Lagerbeholdning" />
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Eget lager</span>
                <span className={`text-lg font-bold tabular-nums ${product.own_stock_quantity > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                  {product.own_stock_quantity}
                  {product.own_stock_reserved > 0 && (
                    <span className="text-sm text-orange-400 ml-1 font-normal">(-{product.own_stock_reserved} res.)</span>
                  )}
                </span>
              </div>
              {suppls.filter(s => s.is_active).map(s => (
                <div key={s.id} className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 text-xs">{s.suppliers.name} <span className="text-gray-300">(#{s.priority})</span></span>
                  <span className={`font-medium tabular-nums ${s.supplier_stock_quantity > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                    {s.supplier_stock_quantity}
                  </span>
                </div>
              ))}
              {suppls.length > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Total tilgængeligt</span>
                  <span className="font-bold text-gray-900 tabular-nums">
                    {ownAvailable + totalSupplierStock}
                  </span>
                </div>
              )}
            </div>
            <dl>
              <Row label="Eget lager"    value={product.own_stock_quantity} />
              <Row label="Reserveret"    value={product.own_stock_reserved > 0 ? product.own_stock_reserved : null} />
            </dl>
          </div>

          {/* Priser */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Priser" />
            <dl>
              <Row label="Salgspris"   value={product.sales_price != null ? `${product.sales_price.toLocaleString('da-DK')} kr` : null} />
              <Row label="Tilbudspris" value={product.sale_price  != null ? `${product.sale_price.toLocaleString('da-DK')} kr`  : null} />
              <Row label="Moms-klasse" value={product.tax_class} />
            </dl>
          </div>

          {/* Identifikation */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Identifikation" />
            <dl>
              <Row label="Internt varenr."  value={product.internal_sku} mono />
              <Row label="Bestillingsnr."   value={product.woo_bestillingsnummer} mono />
              <Row label="EAN / Stregkode"  value={product.ean} mono />
              <Row label="Producent SKU"    value={product.manufacturer_sku} mono />
              <Row label="Brand"            value={product.brand} />
              <Row label="Slug"             value={product.slug} mono />
            </dl>
          </div>

          {/* Producent */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Producent" />
            <dl>
              <Row label="Navn"       value={product.manufacturers?.name} />
              <Row label="Land"       value={product.manufacturers?.country} />
              <Row label="Website"    value={product.manufacturers?.website
                ? <a href={product.manufacturers.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">{product.manufacturers.website}</a>
                : null} />
              <Row label="Ref. ID"    value={product.manufacturer_id} mono />
            </dl>
          </div>

          {/* Mål & fragt */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Mål & fragt" />
            <dl>
              <Row label="Vægt"      value={product.weight  != null ? `${product.weight} kg`  : null} />
              <Row label="Længde"    value={product.length  != null ? `${product.length} cm`  : null} />
              <Row label="Bredde"    value={product.width   != null ? `${product.width} cm`   : null} />
              <Row label="Højde"     value={product.height  != null ? `${product.height} cm`  : null} />
              <Row label="Video URL" value={product.video_url
                ? <a href={product.video_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs truncate block max-w-full">{product.video_url}</a>
                : null} />
            </dl>
          </div>

          {/* Kategorier & tags */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Kategorier & tags" />
            <Row label="Kategorier" value={
              product.categories?.length > 0
                ? <div className="flex flex-wrap gap-1">{product.categories.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c}</span>)}</div>
                : null
            } />
            <Row label="Tags" value={
              product.tags?.length > 0
                ? <div className="flex flex-wrap gap-1">{product.tags.map(t => <span key={t} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{t}</span>)}</div>
                : null
            } />
            {product.attributes?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-1">Attributter</p>
                <dl className="space-y-1">
                  {product.attributes.map(a => (
                    <div key={a.name} className="flex gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                      <dt className="text-gray-400 w-28 shrink-0">{a.name}</dt>
                      <dd className="text-gray-700">{Array.isArray(a.value) ? a.value.join(', ') : a.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {/* Specifikationer */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <SectionHeader title="Specifikationer" />
              <dl>
                {Object.entries(product.specifications).map(([k, v]) => (
                  <Row key={k} label={k} value={String(v)} />
                ))}
              </dl>
            </div>
          )}

          {/* SEO */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="SEO" />
            <dl>
              <Row label="Meta-titel"       value={product.meta_title} />
              <Row label="Meta-beskrivelse" value={product.meta_description} />
            </dl>
          </div>

          {/* WooCommerce */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="WooCommerce" />
            <dl>
              <Row label="Woo produkt-ID"  value={product.woo_product_id} />
              <Row label="Sync status"     value={product.woo_sync_status} />
              <Row label="Sidst synkret"   value={product.last_synced_woo_at ? new Date(product.last_synced_woo_at).toLocaleString('da-DK') : null} />
              <Row label="Bestillingsnr."  value={product.woo_bestillingsnummer} mono />
            </dl>
          </div>

          {/* POS */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="POS (admind)" />
            <dl>
              <Row label="POS produkt-ID" value={product.pos_product_id} mono />
              <Row label="Sidst synkret"  value={product.last_synced_pos_at ? new Date(product.last_synced_pos_at).toLocaleString('da-DK') : null} />
            </dl>
          </div>

          {/* Timestamps & status */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionHeader title="Registrering" />
            <dl>
              <Row label="Produkt-ID" value={product.id} mono />
              <Row label="Status"     value={
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[product.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[product.status] ?? product.status}
                </span>
              } />
              <Row label="Oprettet"   value={new Date(product.created_at).toLocaleString('da-DK')} />
              <Row label="Opdateret"  value={new Date(product.updated_at).toLocaleString('da-DK')} />
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
