import type { Metadata } from 'next'
import Link from 'next/link'
import { unsubscribe } from '../konto/actions'

export const metadata: Metadata = { title: 'Afmeld nyheder', robots: { index: false } }

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams
  return (
    <div className="ls-account-login">
      <h1>Nyheder og påmindelser</h1>
      {done ? (
        <p>Du er afmeldt og modtager ikke flere nyheder eller påmindelser fra os. Du kan altid tilmelde dig igen under <Link href="/konto">Min konto</Link>.</p>
      ) : t ? (
        <form action={unsubscribe}>
          <input type="hidden" name="t" value={t} />
          <p>Vil du afmelde nyheder, tilbud og påmindelser om udskiftning fra LoveSailing?</p>
          <button type="submit" className="ls-checkout-btn">Afmeld</button>
        </form>
      ) : (
        <p>Linket er ugyldigt. Log ind under <Link href="/konto">Min konto</Link> for at ændre dine indstillinger.</p>
      )}
    </div>
  )
}
