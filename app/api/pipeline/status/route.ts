import { PipelineRun } from '@/lib/pipeline-run'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const run = await PipelineRun.latest()
  return NextResponse.json({ data: run })
}
