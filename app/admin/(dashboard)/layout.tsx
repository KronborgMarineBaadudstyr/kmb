import { redirect } from 'next/navigation'
import SidebarClient from './_sidebar'
import { getCurrentAdmin } from '@/lib/admin-auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/login')

  return (
    <div className="flex h-full">
      <SidebarClient admin={{ email: admin.email, role: admin.role }} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
