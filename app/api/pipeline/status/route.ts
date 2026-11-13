import { PipelineRun } from '@/lib/pipeline-run'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin(); if (denied) return denied
  const run = await PipelineRun.latest()
  return NextResponse.json({ data: run })
}
