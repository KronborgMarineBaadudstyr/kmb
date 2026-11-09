import Link from 'next/link'
import { safeNext } from '@/lib/tokens'
import { verifyAdminLogin } from '../actions'
import { PendingSubmit } from '@/app/_components/pending-submit'

export const metadata = { title: 'Log ind', robots: { index: false } }

export default async function ConfirmAdminLoginPage({
  searchParams,
}: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams
  const safe = safeNext(next)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
        <h1 className="text-base font-semibold text-gray-900 mb-2">Log ind på admin</h1>
        {token ? (
          <form action={verifyAdminLogin} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            {safe && <input type="hidden" name="next" value={safe} />}
            <p className="text-sm text-gray-500">Klik for at fuldføre dit login.</p>
            <PendingSubmit label="Log ind →" pendingLabel="Logger ind…"
              className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:bg-gray-600" />
          </form>
        ) : (
          <p className="text-sm text-gray-500">Linket mangler en kode. <Link href="/login" className="text-blue-600 underline">Bed om et nyt</Link>.</p>
        )}
      </div>
    </div>
  )
}
