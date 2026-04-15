import { importPalby } from '@/lib/importers/palby'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Kører dagligt kl. 23 — efter Palby opdaterer fuld produktfil kl. 22
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let matched = 0, updated = 0, staged = 0, errors = 0

  try {
    await importPalby(p => {
      matched = p.matched; updated = p.updated; staged = p.staged; errors = p.errors
    }, { delta: false })  // fuld fil — Palby har ikke en stabil delta-produktfil endnu

    console.log(`[cron] Palby produktsync done — matched:${matched} updated:${updated} staged:${staged} errors:${errors}`)
    return NextResponse.json({ ok: true, matched, updated, staged, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron] Palby produktsync fejl:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
