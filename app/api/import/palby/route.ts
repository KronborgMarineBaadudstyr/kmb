import { importPalby, syncPalbyStock } from '@/lib/importers/palby'
import type { PalbyImportProgress } from '@/lib/importers/palby'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 min — store XML-filer tager tid

// GET /api/import/palby         → fuld produktimport (SSE)
// GET /api/import/palby?limit=N → test med N produkter
// GET /api/import/palby?mode=stock → kun lagersync
export async function GET(request: Request) {
  const url   = new URL(request.url)
  const limit = url.searchParams.get('limit')
  const mode  = url.searchParams.get('mode')

  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController

  const stream = new ReadableStream({
    start(c) { controller = c },
  })

  function send(data: PalbyImportProgress) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  function done() {
    controller.close()
  }

  // Start import asynkront
  ;(async () => {
    try {
      if (mode === 'stock') {
        await syncPalbyStock(send)
      } else {
        await importPalby(send, { limit: limit ? parseInt(limit, 10) : undefined })
      }
    } catch (e: unknown) {
      send({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 1,
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      done()
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
