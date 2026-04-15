// Vercel Cron Jobs sender Authorization: Bearer <CRON_SECRET>
// Sæt CRON_SECRET som env-variabel i Vercel dashboard
export function verifyCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}
