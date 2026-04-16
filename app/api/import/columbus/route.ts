import { importColumbus } from '@/lib/importers/columbus'
import type { ColumbusImportProgress } from '@/lib/importers/columbus'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// GET /api/import/columbus          → fuld import
// GET /api/import/columbus?limit=N  → test med N produkter

export async function GET(request: Request) {
  const url   = new URL(request.url)
  const limit = url.searchParams.get('limit')

  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c },
  })

  ;(async () => {
    try {
      await importColumbus(
        (data: ColumbusImportProgress) => {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        },
        { limit: limit ? parseInt(limit, 10) : undefined }
      )
    } catch (e: unknown) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 1,
        message: e instanceof Error ? e.message : String(e),
      })}\n\n`))
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
