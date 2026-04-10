import { NextResponse } from 'next/server'
import { importEngholm } from '@/lib/importers/engholm'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined

  const encoder = new TextEncoder()
  const stream  = new TransformStream()
  const writer  = stream.writable.getWriter()

  function send(data: object) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      await importEngholm(progress => send(progress), { limit })
    } catch (err) {
      send({ stage: 'error', message: String(err), total: 0, processed: 0, created: 0, updated: 0, errors: 1 })
    } finally {
      writer.close()
    }
  })()

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
