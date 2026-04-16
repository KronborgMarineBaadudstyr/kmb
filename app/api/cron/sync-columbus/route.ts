import { importColumbus } from '@/lib/importers/columbus'
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
    await importColumbus(p => {
      matched = p.matched; updated = p.updated; staged = p.staged; skipped = p.skipped; errors = p.errors
    })

    console.log(`[cron] Columbus sync done — matched:${matched} updated:${updated} staged:${staged} skipped:${skipped} errors:${errors}`)
    return NextResponse.json({ ok: true, matched, updated, staged, skipped, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Columbus sync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
