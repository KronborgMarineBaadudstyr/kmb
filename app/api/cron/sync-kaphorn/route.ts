import { importKapHorn } from '@/lib/importers/kaphorn'
import { trackImport } from '@/lib/import-run'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let matched = 0, updated = 0, staged = 0, skipped = 0, errors = 0

  try {
    await trackImport({ supplier: 'Kap-Horn', source: 'cron', kind: 'products' }, onP => importKapHorn(onP), p => {
      matched = p.matched ?? 0; updated = p.updated ?? 0; staged = p.staged ?? 0
      skipped = p.skipped ?? 0; errors = p.errors ?? 0
    })

    console.log(`[cron] Kap-Horn sync done — matched:${matched} updated:${updated} staged:${staged} skipped:${skipped} errors:${errors}`)
    return NextResponse.json({ ok: true, matched, updated, staged, skipped, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Kap-Horn sync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
