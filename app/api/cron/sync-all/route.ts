import { importEngholm }      from '@/lib/importers/engholm'
import { trackImport } from '@/lib/import-run'
import { importScanmarine }   from '@/lib/importers/scanmarine'
import { importPalby, syncPalbyStock } from '@/lib/importers/palby'
import { importColumbus }     from '@/lib/importers/columbus'
import { importKapHorn, syncKapHornStock } from '@/lib/importers/kaphorn'
import { verifyCronRequest }  from '@/lib/cron-auth'
import { NextResponse }       from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any

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

  await run('engholm',       () => trackImport({ supplier: 'Engholm',         source: 'cron', kind: 'products' }, onP => importEngholm(onP)))
  await run('scanmarine',    () => trackImport({ supplier: 'Scanmarine',      source: 'cron', kind: 'products' }, onP => importScanmarine(onP)))
  await run('palby',         () => trackImport({ supplier: 'Palby',           source: 'cron', kind: 'products' }, onP => importPalby(onP)))
  await run('palby-stock',   () => trackImport({ supplier: 'Palby',           source: 'cron', kind: 'stock' },    onP => syncPalbyStock(onP, { full: true })))
  await run('columbus',      () => trackImport({ supplier: 'Columbus Marine', source: 'cron', kind: 'products' }, onP => importColumbus(onP)))
  await run('kaphorn',       () => trackImport({ supplier: 'Kap-Horn',        source: 'cron', kind: 'products' }, onP => importKapHorn(onP)))
  await run('kaphorn-stock', () => trackImport({ supplier: 'Kap-Horn',        source: 'cron', kind: 'stock' },    onP => syncKapHornStock(onP)))

  const allOk = Object.values(results).every(v => v === 'ok')
  console.log('[cron] sync-all færdig:', results)
  return NextResponse.json({ ok: allOk, results })
}
