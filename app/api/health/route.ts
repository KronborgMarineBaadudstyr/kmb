export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: {
      supabase_url:  !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      service_key:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      anon_key:      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      dashboard_pw:  !!process.env.DASHBOARD_PASSWORD,
      woo_url:       !!process.env.WOO_BASE_URL,
    }
  })
}
