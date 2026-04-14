import { importPalby, syncPalbyStock } from '@/lib/importers/palby'
import type { PalbyImportProgress } from '@/lib/importers/palby'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET /api/import/palby                 → fuld produktimport
// GET /api/import/palby?delta=1         → delta produktimport (kun ændringer siden sidst)
// GET /api/import/palby?limit=N         → test-import med N produkter
// GET /api/import/palby?mode=stock      → delta lagersync (kun nye delta-filer)
// GET /api/import/palby?mode=stock-full → komplet lagersync (web_stockstatus_newitemid.xml)

export async function GET(request: Request) {
  const url   = new URL(request.url)
  const mode  = url.searchParams.get('mode')   // 'stock' | 'stock-full' | null
  const delta = url.searchParams.get('delta')  // '1' = brug delta produktfil
  const limit = url.searchParams.get('limit')

  const encoder = new TextEncoder()
  // eslint-disable-next-line prefer-const
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c },
  })

  function send(data: PalbyImportProgress) {
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      if (mode === 'stock') {
        await syncPalbyStock(send, { full: false })
      } else if (mode === 'stock-full') {
        await syncPalbyStock(send, { full: true })
      } else {
        await importPalby(send, {
          limit: limit ? parseInt(limit, 10) : undefined,
          delta: delta === '1',
        })
      }
    } catch (e: unknown) {
      send({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 1,
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      ctrl.close()
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
