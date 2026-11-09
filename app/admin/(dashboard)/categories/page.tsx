import { redirect } from 'next/navigation'

// Flyttet til Indstillinger → Sortiment
export default function Page() { redirect('/admin/sortiment?tab=kategorier') }
