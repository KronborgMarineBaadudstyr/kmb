import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SidebarClient from './_sidebar'

const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'KMB3000'
const COOKIE   = 'kmb-session'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth — kører i Node.js runtime, ingen Edge-problemer
  const jar   = await cookies()
  const token = jar.get(COOKIE)?.value

  if (token !== PASSWORD) {
    redirect('/login')
  }

  return (
    <div className="flex h-full">
      <SidebarClient />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
