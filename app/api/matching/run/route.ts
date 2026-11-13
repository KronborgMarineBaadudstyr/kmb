import { runMatchingEngine } from '@/lib/matching-engine'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const denied = await requireAdmin(); if (denied) return denied
  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c },
  })

  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await runMatchingEngine(send)
    } catch (err) {
      send({ stage: 'error', message: String(err) })
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
