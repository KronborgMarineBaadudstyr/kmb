import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SidebarClient from './_sidebar'
import { ADMIN_COOKIE, isAdminCookie } from '@/lib/admin-session'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth — kører i Node.js runtime, ingen Edge-problemer
  const jar   = await cookies()
  if (!isAdminCookie(jar.get(ADMIN_COOKIE)?.value)) {
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
