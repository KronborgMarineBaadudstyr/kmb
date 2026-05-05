'use client'

import { useState, useEffect, useCallback } from 'react'

type VariantAttribute = { name: string; unit: string }

type ProductTypeRow = {
  id: string
  name: string
  keywords: string[]
  variant_attributes: VariantAttribute[]
  our_category: string | null
  our_subcategory: string | null
  notes: string | null
  active: boolean
}

type FormState = {
  name: string
  keywords: string          // comma-separated
  our_category: string
  our_subcategory: string
  notes: string
  variant_attributes: VariantAttribute[]
}

const emptyForm = (): FormState => ({
  name: '',
  keywords: '',
  our_category: '',
  our_subcategory: '',
  notes: '',
  variant_attributes: [],
})

function formFromRow(row: ProductTypeRow): FormState {
  return {
    name:               row.name,
    keywords:           row.keywords.join(', '),
    our_category:       row.our_category ?? '',
    our_subcategory:    row.our_subcategory ?? '',
    notes:              row.notes ?? '',
    variant_attributes: row.variant_attributes.map(a => ({ ...a })),
  }
}

// ──────────────────────────────────────────────────────────────
// Form component (reused for both "new" and "edit" modes)
// ──────────────────────────────────────────────────────────────
function ProductTypeForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addAttr() {
    setForm(f => ({ ...f, variant_attributes: [...f.variant_attributes, { name: '', unit: '' }] }))
  }

  function removeAttr(i: number) {
    setForm(f => ({ ...f, variant_attributes: f.variant_attributes.filter((_, j) => j !== i) }))
  }

  function setAttr(i: number, key: 'name' | 'unit', value: string) {
    setForm(f => {
      const attrs = [...f.variant_attributes]
      attrs[i] = { ...attrs[i], [key]: value }
      return { ...f, variant_attributes: attrs }
    })
  }

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Navn *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="Ankerkæde"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Nøgleord (kommasepareret) *
        </label>
        <input
          type="text"
          value={form.keywords}
          onChange={e => setField('keywords', e.target.value)}
          placeholder="ankerkæde, kæde, ankerkæde galvaniseret"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Et produktnavn der indeholder et af disse ord matches til denne type.
        </p>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Vores kategori</label>
          <input
            type="text"
            value={form.our_category}
            onChange={e => setField('our_category', e.target.value)}
            placeholder="Ankre & fortøjning"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Underkategori</label>
          <input
            type="text"
            value={form.our_subcategory}
            onChange={e => setField('our_subcategory', e.target.value)}
            placeholder="Kædeankre"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Variant attributes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-700">Variantegenskaber</label>
          <button
            type="button"
            onClick={addAttr}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Tilføj egenskab
          </button>
        </div>
        {form.variant_attributes.length === 0 && (
          <p className="text-xs text-gray-400 italic">
            Ingen variantegenskaber — produktet oprettes uden varianter.
          </p>
        )}
        <div className="space-y-2">
          {form.variant_attributes.map((attr, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={attr.name}
                onChange={e => setAttr(i, 'name', e.target.value)}
                placeholder="Godstyklelse"
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={attr.unit}
                onChange={e => setAttr(i, 'unit', e.target.value)}
                placeholder="mm"
                className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => removeAttr(i)}
                className="text-red-500 hover:text-red-700 text-sm px-2"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {form.variant_attributes.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            Navn = egenskabsnavnet (vises i Woo), Enhed = hvad der ekstraheres fra produktnavnet (mm, m, l…)
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Noter (valgfrit)</label>
        <textarea
          value={form.notes}
          onChange={e => setField('notes', e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.keywords.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Gemmer…' : 'Gem'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
        >
          Annuller
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────
export default function ProductTypesPage() {
  const [rows, setRows]         = useState<ProductTypeRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showNew, setShowNew]   = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/product-types')
      if (!res.ok) throw new Error(await res.text())
      setRows(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(form: FormState) {
    setSaving(true)
    try {
      const res = await fetch('/api/product-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name.trim(),
          keywords:           form.keywords.split(',').map(s => s.trim()).filter(Boolean),
          variant_attributes: form.variant_attributes.filter(a => a.name.trim() && a.unit.trim()),
          our_category:       form.our_category.trim() || null,
          our_subcategory:    form.our_subcategory.trim() || null,
          notes:              form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setShowNew(false)
      await load()
    } catch (e) {
      alert(`Fejl: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string, form: FormState) {
    setSaving(true)
    try {
      const res = await fetch(`/api/product-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name.trim(),
          keywords:           form.keywords.split(',').map(s => s.trim()).filter(Boolean),
          variant_attributes: form.variant_attributes.filter(a => a.name.trim() && a.unit.trim()),
          our_category:       form.our_category.trim() || null,
          our_subcategory:    form.our_subcategory.trim() || null,
          notes:              form.notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setEditId(null)
      await load()
    } catch (e) {
      alert(`Fejl: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/product-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? await res.text())
      setDeleteId(null)
      await load()
    } catch (e) {
      alert(`Fejl: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const rowToDelete = rows.find(r => r.id === deleteId)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Produkttyper</h1>
          <p className="text-sm text-gray-500 mt-1">
            Definer produkttyper med nøgleord og variantregler til brug ved produktoprettelse fra matching.
          </p>
        </div>
        {!showNew && (
          <button
            onClick={() => { setShowNew(true); setEditId(null) }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            + Ny produkttype
          </button>
        )}
      </div>

      {/* New form */}
      {showNew && (
        <div className="bg-white border border-blue-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Ny produkttype</h2>
          <ProductTypeForm
            initial={emptyForm()}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-sm text-gray-400">Indlæser…</div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !showNew && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-500 text-sm">Ingen produkttyper endnu.</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            Opret første produkttype
          </button>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            {editId === row.id ? (
              <>
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Rediger: {row.name}</h3>
                <ProductTypeForm
                  initial={formFromRow(row)}
                  onSave={f => handleUpdate(row.id, f)}
                  onCancel={() => setEditId(null)}
                  saving={saving}
                />
              </>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{row.name}</span>
                    {!row.active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        Inaktiv
                      </span>
                    )}
                    {row.our_category && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                        {row.our_category}
                        {row.our_subcategory ? ` › ${row.our_subcategory}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-1">
                    {row.keywords.map(kw => (
                      <span key={kw} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>

                  {/* Variant attributes */}
                  {row.variant_attributes.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-gray-400">Varianter:</span>
                      {row.variant_attributes.map((a, i) => (
                        <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                          {a.name} ({a.unit})
                        </span>
                      ))}
                    </div>
                  )}

                  {row.notes && (
                    <p className="text-xs text-gray-400 italic">{row.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setEditId(row.id); setShowNew(false) }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Rediger
                  </button>
                  <button
                    onClick={() => setDeleteId(row.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Slet
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirm dialog */}
      {deleteId && rowToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Slet produkttype?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Er du sikker på, at du vil slette{' '}
              <span className="font-medium">{rowToDelete.name}</span>?
              Dette kan ikke fortrydes.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
              >
                Annuller
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Sletter…' : 'Slet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
