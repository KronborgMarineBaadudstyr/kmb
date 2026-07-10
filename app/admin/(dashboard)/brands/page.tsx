'use client'

import { useEffect, useState } from 'react'

interface Brand {
  id: string
  name: string
  aliases: string[]
  created_at: string
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [newName, setNewName] = useState('')
  const [newAliases, setNewAliases] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    const r = await fetch('/api/brands')
    const j = await r.json()
    setBrands(j.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create() {
    if (!newName.trim()) return
    setSaving(true)
    const aliases = newAliases.split(',').map(s => s.trim()).filter(Boolean)
    const r = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), aliases }),
    })
    if (r.ok) {
      setNewName(''); setNewAliases('')
      setMsg('Brand oprettet ✓')
      await load()
    } else {
      const j = await r.json()
      setMsg(`Fejl: ${j.error}`)
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  function startEdit(b: Brand) {
    setEditId(b.id)
    setEditName(b.name)
    setEditAliases(b.aliases.join(', '))
  }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)
    const aliases = editAliases.split(',').map(s => s.trim()).filter(Boolean)
    const r = await fetch(`/api/brands?id=${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), aliases }),
    })
    if (r.ok) {
      setEditId(null)
      setMsg('Gemt ✓')
      await load()
    } else {
      const j = await r.json()
      setMsg(`Fejl: ${j.error}`)
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function deleteBrand(id: string, name: string) {
    if (!confirm(`Slet brand "${name}"?`)) return
    const r = await fetch(`/api/brands?id=${id}`, { method: 'DELETE' })
    if (r.ok) { setMsg('Slettet'); await load() }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Brands</h1>
      <p className="text-sm text-gray-500 mb-6">
        Kendte brands bruges til automatisk at udlede brand fra produktnavn ved import.
        Aliasser er alternative stavemåder (kommasepareret, case-insensitiv).
      </p>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded bg-blue-50 text-blue-800 text-sm">{msg}</div>
      )}

      {/* Add new brand */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Tilføj nyt brand</h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Navn *</label>
            <input
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44"
              placeholder="f.eks. LIROS"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aliasser (kommasepareret)</label>
            <input
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
              placeholder="f.eks. liros, Liros"
              value={newAliases}
              onChange={e => setNewAliases(e.target.value)}
            />
          </div>
          <button
            onClick={create}
            disabled={saving || !newName.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Tilføj
          </button>
        </div>
      </div>

      {/* Brand list */}
      {loading ? (
        <p className="text-sm text-gray-400">Indlæser…</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Brand</th>
                <th className="px-4 py-2 text-left">Aliasser</th>
                <th className="px-4 py-2 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {brands.map(b => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                  {editId === b.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          className="border border-blue-400 rounded px-2 py-1 text-sm w-full"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="border border-blue-400 rounded px-2 py-1 text-sm w-full"
                          value={editAliases}
                          onChange={e => setEditAliases(e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <button onClick={saveEdit} disabled={saving} className="text-blue-600 hover:underline text-xs">Gem</button>
                        <button onClick={() => setEditId(null)} className="text-gray-400 hover:underline text-xs">Annuller</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-medium text-gray-900">{b.name}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {b.aliases.length > 0
                          ? b.aliases.join(', ')
                          : <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <button onClick={() => startEdit(b)} className="text-blue-600 hover:underline text-xs">Rediger</button>
                        <button onClick={() => deleteBrand(b.id, b.name)} className="text-red-400 hover:underline text-xs">Slet</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 text-right">
            {brands.length} brands i alt
          </div>
        </div>
      )}
    </div>
  )
}
