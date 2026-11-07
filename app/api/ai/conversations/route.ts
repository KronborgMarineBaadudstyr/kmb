import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/ai/conversations — den indloggede admins samtaler
export async function GET() {
  const admin = await getCurrentAdmin()
  if (!admin) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const { data, error } = await createServiceClient().from('ai_conversations')
    .select('id, title, updated_at').eq('admin_user_id', admin.id)
    .order('updated_at', { ascending: false }).limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}
