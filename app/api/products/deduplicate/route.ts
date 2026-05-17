import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/products/deduplicate
// Finds products with identical names, keeps the one with most product_suppliers,
// merges all product_suppliers onto the winner, updates parent_product_id refs, deletes duplicates.
export async function POST() {
  const supabase = createServiceClient()

  // 1. Load all products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, parent_product_id')
    .order('name')

  if (pErr || !products) {
    return NextResponse.json({ error: pErr?.message ?? 'Kunne ikke hente produkter' }, { status: 500 })
  }

  // 2. Get supplier counts per product
  const { data: supplierRows } = await supabase
    .from('product_suppliers')
    .select('product_id')

  const countMap = new Map<string, number>()
  for (const row of supplierRows ?? []) {
    if (row.product_id) countMap.set(row.product_id, (countMap.get(row.product_id) ?? 0) + 1)
  }

  // 3. Group by normalized name
  const groups = new Map<string, Array<{ id: string; name: string; parent_product_id: string | null }>>()
  for (const p of products) {
    const key = (p.name ?? '').toLowerCase().trim()
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(p)
    groups.set(key, arr)
  }

  const dupeGroups = [...groups.values()].filter(g => g.length > 1)

  if (dupeGroups.length === 0) {
    return NextResponse.json({ groups: 0, merged: 0, deleted: 0, message: 'Ingen dubletter fundet' })
  }

  let totalDeleted = 0
  const errors: string[] = []

  for (const group of dupeGroups) {
    // Winner = most supplier entries; tie-break by id (deterministic)
    const sorted = [...group].sort((a, b) => {
      const diff = (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0)
      return diff !== 0 ? diff : a.id.localeCompare(b.id)
    })

    const winner = sorted[0]
    const losers = sorted.slice(1)
    const loserIds = losers.map(l => l.id)

    // Get winner's existing supplier IDs to avoid duplicates
    const { data: winnerSuppliers } = await supabase
      .from('product_suppliers')
      .select('supplier_id')
      .eq('product_id', winner.id)

    const winnerSupplierSet = new Set((winnerSuppliers ?? []).map(r => r.supplier_id as string))

    for (const loser of losers) {
      // Get loser's suppliers
      const { data: loserSuppliers } = await supabase
        .from('product_suppliers')
        .select('supplier_id')
        .eq('product_id', loser.id)

      const toMove   = (loserSuppliers ?? []).filter(r => !winnerSupplierSet.has(r.supplier_id)).map(r => r.supplier_id as string)
      const toDelete = (loserSuppliers ?? []).filter(r =>  winnerSupplierSet.has(r.supplier_id)).map(r => r.supplier_id as string)

      // Move non-conflicting suppliers to winner
      if (toMove.length > 0) {
        const { error: moveErr } = await supabase
          .from('product_suppliers')
          .update({ product_id: winner.id })
          .eq('product_id', loser.id)
          .in('supplier_id', toMove)
        if (moveErr) errors.push(`Flyt leverandører ${loser.id}→${winner.id}: ${moveErr.message}`)
        else toMove.forEach(sid => winnerSupplierSet.add(sid))
      }

      // Delete duplicate supplier entries on loser
      if (toDelete.length > 0) {
        await supabase
          .from('product_suppliers')
          .delete()
          .eq('product_id', loser.id)
          .in('supplier_id', toDelete)
      }

      // Redirect any variant parent refs
      await supabase
        .from('products')
        .update({ parent_product_id: winner.id })
        .eq('parent_product_id', loser.id)
    }

    // Delete all loser products
    const { error: delErr } = await supabase
      .from('products')
      .delete()
      .in('id', loserIds)

    if (delErr) {
      errors.push(`Slet dubletter for "${winner.name}": ${delErr.message}`)
    } else {
      totalDeleted += loserIds.length
    }
  }

  return NextResponse.json({
    groups: dupeGroups.length,
    deleted: totalDeleted,
    errors: errors.length > 0 ? errors : undefined,
    message: `Fandt ${dupeGroups.length} dublet-grupper. Slettede ${totalDeleted} dubletter og samlede leverandørlinks på det bedste produkt.`,
  })
}
