import { importEngholm }      from '@/lib/importers/engholm'
import { importScanmarine }   from '@/lib/importers/scanmarine'
import { importPalby, syncPalbyStock } from '@/lib/importers/palby'
import { importColumbus }     from '@/lib/importers/columbus'
import { importKapHorn, syncKapHornStock } from '@/lib/importers/kaphorn'
import { verifyCronRequest }  from '@/lib/cron-auth'
import { NextResponse }       from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = (_: any) => {}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, string> = {}

  async function run(name: string, fn: () => Promise<void>) {
    try {
      await fn()
      results[name] = 'ok'
      console.log(`[cron] sync-all: ${name} ok`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      results[name] = msg
      console.error(`[cron] sync-all: ${name} fejl:`, msg)
    }
  }

  await run('engholm',       () => importEngholm(noop))
  await run('scanmarine',    () => importScanmarine(noop))
  await run('palby',         () => importPalby(noop))
  await run('palby-stock',   () => syncPalbyStock(noop, { full: true }))
  await run('columbus',      () => importColumbus(noop))
  await run('kaphorn',       () => importKapHorn(noop))
  await run('kaphorn-stock', () => syncKapHornStock(noop))

  const allOk = Object.values(results).every(v => v === 'ok')
  console.log('[cron] sync-all færdig:', results)
  return NextResponse.json({ ok: allOk, results })
}
