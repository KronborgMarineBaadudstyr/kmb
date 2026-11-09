import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cleanAttributeInput } from '@/lib/variant-attributes'

export const dynamic = 'force-dynamic'

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205'

// GET /api/variant-attributes — alle fælles variant-egenskaber (tom liste før migration 065)
export async function GET() {
  const { data, error } = await createServiceClient()
    .from('variant_attributes').select('id, name, unit, values, sort_order')
    .order('sort_order').order('name')
  if (error) {
    if (missingTable(error.code)) return NextResponse.json({ data: [], migration_missing: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// POST /api/variant-attributes — opret egenskab
export async function POST(request: Request) {
  const input = cleanAttributeInput(await request.json().catch(() => null))
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })
  const { data, error } = await createServiceClient()
    .from('variant_attributes').insert({ sort_order: 100, ...input }).select().single()
  if (error) {
    if (missingTable(error.code)) return NextResponse.json({ error: 'Kør migration 065 i Supabase først' }, { status: 503 })
    if (error.code === '23505') return NextResponse.json({ error: `Der findes allerede en egenskab der hedder "${input.name}"` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}
