import { syncPalbyStock } from '@/lib/importers/palby'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

// Kører 4 gange dagligt (kl. 7, 12, 17, 22)
// Henter kun delta-lagerfiler nyere end sidst behandlede timestamp
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let updated = 0, errors = 0

  try {
    await syncPalbyStock(p => {
      updated = p.updated; errors = p.errors
    }, { full: false })  // kun delta-filer

    console.log(`[cron] Palby lagersync done — updated:${updated} errors:${errors}`)
    return NextResponse.json({ ok: true, updated, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Palby lagersync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
