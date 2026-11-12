'use server'

import { getCurrentAdmin } from '@/lib/admin-auth'
import { matchPosItems, findStagedPosItems, importPosReceipts, type PosMatch, type PosLineMatch } from '@/lib/old-orders/pos-import'
import type { PosReceipt } from '@/lib/old-orders/pos-parser'

// Server actions går ikke gennem middleware — admin-tjek her
export async function matchPosAction(items: { item_no: string; group: string | null }[]): Promise<{ matches: Record<string, PosMatch>; staged: Record<string, string> } | { error: string }> {
  if (!(await getCurrentAdmin())) return { error: 'Log ind som admin' }
  if (!Array.isArray(items) || items.length > 3000) return { error: 'For mange varenumre på én gang' }
  try {
    const matches = await matchPosItems(items)
    const staged = await findStagedPosItems(items.map(i => i.item_no).filter(n => !matches[n]))
    return { matches, staged }
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}

export async function importPosAction(receipts: PosReceipt[], matches: Record<string, PosLineMatch>, update = false): Promise<{ imported: number; updated: number; skipped: number; errors: string[] } | { error: string }> {
  if (!(await getCurrentAdmin())) return { error: 'Log ind som admin' }
  if (!Array.isArray(receipts) || receipts.length > 1000) return { error: 'Højst 1000 bonner pr. kald' }
  try { return await importPosReceipts(receipts, matches ?? {}, update === true) } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}
