import { cookies } from 'next/headers'

// Samme tjek som app/admin/(dashboard)/layout.tsx. Server actions og API-ruter går ikke
// gennem layoutet, så de skal selv kalde denne.
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies()
  return jar.get('kmb-session')?.value === (process.env.DASHBOARD_PASSWORD ?? 'KMB3000')
}
