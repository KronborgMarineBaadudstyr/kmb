import { NextResponse } from 'next/server'
import { buildPurchaseList, purchaseCsv } from '@/lib/purchasing'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

// GET /api/purchasing/export?supplier=<supplier_id|none> — CSV til leverandøren
export async function GET(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied
  const supplier = new URL(request.url).searchParams.get('supplier') ?? ''
  const { groups, error } = await buildPurchaseList()
  if (error) return NextResponse.json({ error }, { status: 500 })

  const group = groups.find(g => (g.supplier_id ?? 'none') === supplier)
  if (!group) return NextResponse.json({ error: 'Intet at bestille hos denne leverandør' }, { status: 404 })

  const slug = group.supplier_name.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10)
  return new Response(purchaseCsv(group), {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="indkoeb-${encodeURIComponent(slug)}-${date}.csv"`,
      'Cache-Control':       'no-store',
    },
  })
}
