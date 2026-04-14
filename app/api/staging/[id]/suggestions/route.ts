import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/staging/[id]/suggestions
// Returnerer fuzzy match-forslag til en staging-række
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: row, error: rowErr } = await supabase
    .from('supplier_product_staging')
    .select('normalized_name, normalized_ean')
    .eq('id', id)
    .single()

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // EAN-match (eksakt — høj tillid)
  if (row.normalized_ean) {
    const { data: eanMatch } = await supabase
      .from('products')
      .select('id, name, internal_sku, ean')
      .eq('ean', row.normalized_ean)
      .limit(1)

    if (eanMatch && eanMatch.length > 0) {
      return NextResponse.json({
        suggestions: [{ ...eanMatch[0], score: 1.0, match_field: 'ean' }],
        ean_match:   true,
      })
    }
  }

  // Fuzzy navn-match via pg_trgm
  const { data: fuzzy, error: fuzzyErr } = await supabase
    .rpc('fuzzy_product_search', { search_name: row.normalized_name, min_score: 0.25 })

  if (fuzzyErr) {
    // Fallback: fuzzy_product_search RPC mangler måske — returner tom liste
    console.error('fuzzy_product_search fejl:', fuzzyErr.message)
    return NextResponse.json({ suggestions: [], ean_match: false, rpc_error: fuzzyErr.message })
  }

  return NextResponse.json({
    suggestions: (fuzzy ?? []).map((r: { id: string; name: string; internal_sku: string; score: number }) => ({
      id:          r.id,
      name:        r.name,
      internal_sku: r.internal_sku,
      score:       parseFloat(String(r.score)),
      match_field: 'name',
    })),
    ean_match: false,
  })
}
