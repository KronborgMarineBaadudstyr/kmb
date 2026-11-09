import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { toAttrOrder, type AttrOrder, type AttrValue } from '@/lib/variant-attributes'

// Rækkefølgen fra Sortiment → Variant-egenskaber (migration 065). Tom før migrationen — så bruges naturlig orden.
export const getAttrOrder = cache(async (): Promise<AttrOrder> => {
  const { data, error } = await createServiceClient()
    .from('variant_attributes').select('name, values').order('sort_order').order('name')
  if (error || !data) return []
  return toAttrOrder(data as { name: string; values: AttrValue[] }[])
})
