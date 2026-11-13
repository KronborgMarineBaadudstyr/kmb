import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('categories')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
