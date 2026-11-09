import { importScanmarine } from '@/lib/importers/scanmarine'
import { trackImport } from '@/lib/import-run'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let matched = 0, updated = 0, staged = 0, errors = 0

  try {
    await trackImport({ supplier: 'Scanmarine', source: 'cron', kind: 'products' }, onP => importScanmarine(onP), p => {
      matched = p.matched ?? 0; updated = p.updated ?? 0; staged = p.staged ?? 0; errors = p.errors ?? 0
    })

    console.log(`[cron] Scanmarine sync done — matched:${matched} updated:${updated} staged:${staged} errors:${errors}`)
    return NextResponse.json({ ok: true, matched, updated, staged, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Scanmarine sync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
