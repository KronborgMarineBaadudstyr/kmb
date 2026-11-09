import { syncKapHornStock } from '@/lib/importers/kaphorn'
import { trackImport } from '@/lib/import-run'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let updated = 0, skipped = 0, errors = 0

  try {
    await trackImport({ supplier: 'Kap-Horn', source: 'cron', kind: 'stock' }, onP => syncKapHornStock(onP), p => {
      updated = p.updated ?? 0; skipped = p.skipped ?? 0; errors = p.errors ?? 0
    })

    console.log(`[cron] Kap-Horn lager sync done — updated:${updated} skipped:${skipped} errors:${errors}`)
    return NextResponse.json({ ok: true, updated, skipped, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Kap-Horn lager sync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
