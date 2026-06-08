'use client'

import { useEffect, useRef, useState } from 'react'

type Supplier = { id: string; name: string }

// Derive a suggested internal SKU from a supplier SKU
function suggestSku(supplierSku: string): string {
  const normalized = supplierSku.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)
  return normalized ? `KMB-${normalized}` : ''
}

export function CreateProductPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (productId: string) => void
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Form state
  const [name,            setName]           = useState('')
  const [brand,           setBrand]          = useState('')
  const [shortDesc,       setShortDesc]      = useState('')
  const [description,     setDescription]    = useState('')
  const [categories,      setCategories]     = useState('')
  const [salesPrice,      setSalesPrice]     = useState('')
  const [ean,             setEan]            = useState('')
  const [manuSku,         setManuSku]        = useState('')
  const [internalSku,     setInternalSku]    = useState('')
  const [skuLocked,       setSkuLocked]      = useState(false) // true once user edits manually
  const [weight,          setWeight]         = useState('')
  const [imageUrl,        setImageUrl]       = useState('')

  // Supplier section
  const [supplierId,      setSupplierId]     = useState('')
  const [supplierSku,     setSupplierSku]    = useState('')
  const [supplierName,    setSupplierName]   = useState('')  // supplier_product_name override
  const [purchasePrice,   setPurchasePrice]  = useState('')
  const [vejlPrice,       setVejlPrice]      = useState('')

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers((j.data ?? []).map((s: Supplier) => ({ id: s.id, name: s.name }))))
    setTimeout(() => nameRef.current?.focus(), 50)
  }, [])

  // Auto-suggest internal SKU from supplier SKU unless user has edited it manually
  useEffect(() => {
    if (skuLocked) return
    if (supplierSku.trim()) {
      setInternalSku(suggestSku(supplierSku.trim()))
    } else {
      setInternalSku('')
    }
  }, [supplierSku, skuLocked])

  async function save() {
    if (!name.trim()) { setError('Produktnavn er påkrævet'); return }
    setSaving(true); setError(null)

    const body: Record<string, unknown> = {
      name: name.trim(),
      status: 'draft',
    }
    if (brand.trim())        body.brand             = brand.trim()
    if (shortDesc.trim())    body.short_description = shortDesc.trim()
    if (description.trim())  body.description       = description.trim()
    if (categories.trim())   body.categories        = categories.split(',').map(s => s.trim()).filter(Boolean)
    if (salesPrice.trim())   body.sales_price       = parseFloat(salesPrice.replace(',', '.'))
    if (ean.trim())          body.ean               = ean.trim()
    if (manuSku.trim())      body.manufacturer_sku  = manuSku.trim()
    if (internalSku.trim())  body.internal_sku      = internalSku.trim().toUpperCase()
    if (weight.trim())       body.weight            = parseFloat(weight.replace(',', '.'))
    if (imageUrl.trim())     body.image_url         = imageUrl.trim()

    if (supplierId) {
      body.supplier_id           = supplierId
      body.supplier_sku          = supplierSku.trim() || internalSku.trim()
      body.supplier_product_name = supplierName.trim() || name.trim()
      if (purchasePrice.trim()) body.purchase_price          = parseFloat(purchasePrice.replace(',', '.'))
      if (vejlPrice.trim())     body.recommended_sales_price = parseFloat(vejlPrice.replace(',', '.'))
    }

    const res  = await fetch('/api/products/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const json = await res.json()
    setSaving(false)

    if (json.error) { setError(json.error); return }

    onCreated(json.data.id)
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[540px] bg-white shadow-xl z-50 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Opret produkt</h3>
            <p className="text-xs text-gray-400 mt-0.5">Nyt produkt fra bunden — kladde-status</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Grunddata ─────────────────────────────────────────────────── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Grunddata</legend>

            <div>
              <label className={labelCls}>Produktnavn <span className="text-red-400">*</span></label>
              <input ref={nameRef} value={name} onChange={e => setName(e.target.value)}
                className={inputCls} placeholder="F.eks. Wirelås rustfri 6mm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Brand / Mærke</label>
                <input value={brand} onChange={e => setBrand(e.target.value)} className={inputCls} placeholder="Plastimo" />
              </div>
              <div>
                <label className={labelCls}>Kategorier <span className="text-gray-400 font-normal">(komma-sep.)</span></label>
                <input value={categories} onChange={e => setCategories(e.target.value)} className={inputCls} placeholder="Tovværk, Beslag" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Kort beskrivelse</label>
              <textarea value={shortDesc} onChange={e => setShortDesc(e.target.value)} rows={2}
                className={inputCls + ' resize-none'} placeholder="1–2 sætninger der vises i produktkort" />
            </div>

            <div>
              <label className={labelCls}>Beskrivelse</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                className={inputCls + ' resize-y'} placeholder="Fuld produktbeskrivelse til webshop" />
            </div>
          </fieldset>

          {/* ── Varenumre & identifikation ────────────────────────────────── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Varenumre & identifikation</legend>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Eget varenr.
                  <span className="ml-1 text-gray-400 font-normal">(auto-genereres)</span>
                </label>
                <input
                  value={internalSku}
                  onChange={e => { setInternalSku(e.target.value.toUpperCase()); setSkuLocked(true) }}
                  onBlur={() => { if (!internalSku.trim()) setSkuLocked(false) }}
                  className={inputCls + ' font-mono text-xs'}
                  placeholder={supplierSku ? suggestSku(supplierSku) || 'KMB-XXXX' : 'KMB-XXXX'}
                />
                {!skuLocked && supplierSku && (
                  <p className="text-xs text-blue-500 mt-0.5">Forslag fra leverandørens varenr.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Producent SKU</label>
                <input value={manuSku} onChange={e => setManuSku(e.target.value)}
                  className={inputCls + ' font-mono text-xs'} placeholder="PLT-WL-6" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>EAN / Stregkode</label>
                <input value={ean} onChange={e => setEan(e.target.value)}
                  className={inputCls + ' font-mono text-xs'} placeholder="5701234567890" />
              </div>
              <div>
                <label className={labelCls}>Primært billede (URL)</label>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  className={inputCls + ' text-xs'} placeholder="https://..." type="url" />
              </div>
            </div>
          </fieldset>

          {/* ── Priser & dimensioner ──────────────────────────────────────── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Priser & dimensioner</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Salgspris (kr)</label>
                <input value={salesPrice} onChange={e => setSalesPrice(e.target.value)}
                  className={inputCls} placeholder="149,95" type="text" inputMode="decimal" />
              </div>
              <div>
                <label className={labelCls}>Vægt (kg)</label>
                <input value={weight} onChange={e => setWeight(e.target.value)}
                  className={inputCls} placeholder="0.5" type="text" inputMode="decimal" />
              </div>
            </div>
          </fieldset>

          {/* ── Leverandør ────────────────────────────────────────────────── */}
          <fieldset className="space-y-3 border border-gray-200 rounded-xl p-4">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Leverandør <span className="text-gray-400 font-normal">(valgfrit)</span>
            </legend>

            <div>
              <label className={labelCls}>Leverandør</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className={inputCls}>
                <option value="">— Ingen leverandør —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {supplierId && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Leverandørens varenr.</label>
                    <input value={supplierSku} onChange={e => setSupplierSku(e.target.value)}
                      className={inputCls + ' font-mono text-xs'} placeholder="CBS-WL-6MM" />
                  </div>
                  <div>
                    <label className={labelCls}>Lev. produktnavn <span className="text-gray-400 font-normal">(hvis andet end ovenfor)</span></label>
                    <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                      className={inputCls + ' text-xs'} placeholder={name || 'Produktnavn hos leverandør'} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Indkøbspris (kr)</label>
                    <input value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                      className={inputCls} placeholder="72,00" type="text" inputMode="decimal" />
                  </div>
                  <div>
                    <label className={labelCls}>Vejl. udsalgspris (kr)</label>
                    <input value={vejlPrice} onChange={e => setVejlPrice(e.target.value)}
                      className={inputCls} placeholder="149,95" type="text" inputMode="decimal" />
                  </div>
                </div>
              </>
            )}
          </fieldset>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0 bg-white">
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
            {saving ? 'Opretter...' : '+ Opret produkt'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            Annuller
          </button>
        </div>
      </div>
    </>
  )
}
