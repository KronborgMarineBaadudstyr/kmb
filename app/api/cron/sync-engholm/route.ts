import { importEngholm } from '@/lib/importers/engholm'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let matched = 0, updated = 0, staged = 0, errors = 0

  try {
    await importEngholm(p => {
      matched = p.matched; updated = p.updated; staged = p.staged; errors = p.errors
    })

    console.log(`[cron] Engholm sync done — matched:${matched} updated:${updated} staged:${staged} errors:${errors}`)
    return NextResponse.json({ ok: true, matched, updated, staged, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Engholm sync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
