import type { Metadata } from 'next'
import Link from 'next/link'
import { verifyLogin } from '../actions'
import { safeNext } from '@/lib/tokens'
import { PendingSubmit } from '@/app/_components/pending-submit'

export const metadata: Metadata = { title: 'Log ind', robots: { index: false } }

export default async function ConfirmLoginPage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams
  const safe = safeNext(next)
  return (
    <div className="ls-account-login">
      <h1>Log ind på LoveSailing</h1>
      {token ? (
        <form action={verifyLogin}>
          <input type="hidden" name="token" value={token} />
          {safe && <input type="hidden" name="next" value={safe} />}
          <p>Klik for at fuldføre dit login.</p>
          <PendingSubmit label="Log ind →" pendingLabel="Logger ind…" className="ls-checkout-btn" />
        </form>
      ) : (
        <p>Linket mangler en kode. <Link href="/konto">Bed om et nyt login-link</Link>.</p>
      )}
    </div>
  )
}
