import { importWooProducts, type ImportProgress } from '@/lib/woocommerce/import'

export const dynamic  = 'force-dynamic'
export const maxDuration = 300  // 5 min (Vercel hobby = 60s — kør lokalt for fuld import)

// GET /api/sync/woo-import?limit=100
// Streamer import-progress som Server-Sent Events (SSE)
export async function GET(request: Request) {
  const url   = new URL(request.url)
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: ImportProgress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await importWooProducts(send, { limit })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Ukendt fejl'
        send({
          stage:      'error',
          total:      0,
          processed:  0,
          errors:     1,
          page:       0,
          totalPages: 0,
          message:    `Fejl: ${errorMsg}`,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',  // Disable nginx buffering
    },
  })
}
