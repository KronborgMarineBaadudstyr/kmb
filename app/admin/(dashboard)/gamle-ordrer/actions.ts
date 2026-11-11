'use server'

import { getCurrentAdmin } from '@/lib/admin-auth'
import { checkInvoices, importInvoices, type InvoiceCheck } from '@/lib/old-orders/import'
import type { ParsedInvoice } from '@/lib/old-orders/invoice-parser'

// Server actions går ikke gennem middleware — admin-tjek her
export async function checkAction(invoices: ParsedInvoice[]): Promise<InvoiceCheck[] | { error: string }> {
  if (!(await getCurrentAdmin())) return { error: 'Log ind som admin' }
  if (!Array.isArray(invoices) || invoices.length > 300) return { error: 'For mange fakturaer på én gang' }
  try { return await checkInvoices(invoices) } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}

export async function importAction(invoices: ParsedInvoice[]): Promise<{ imported: number; skipped: number; errors: string[] } | { error: string }> {
  const me = await getCurrentAdmin()
  if (!me) return { error: 'Log ind som admin' }
  if (!Array.isArray(invoices) || invoices.length > 100) return { error: 'Højst 100 fakturaer pr. kald' }
  try { return await importInvoices(invoices, me.email) } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}
