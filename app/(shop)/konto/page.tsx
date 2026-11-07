import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getShopUser } from '@/lib/shop/auth'
import { LIFECYCLE_COLUMNS, type LifecycleRow, fmtDate, addDays } from '@/lib/shop/lifecycle'
import { fmtKr } from '@/lib/shop/email'
import { LoginForm } from './_login-form'
import { LifeItem } from './_life-item'
import { logout, setMarketing } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Min konto', robots: { index: false } }

const LOGIN_NOTICES: Record<string, string> = {
  udloebet: 'Login-linket er udløbet eller allerede brugt. Bed om et nyt herunder.',
  ugyldig:  'Login-linket er ugyldigt. Bed om et nyt herunder.',
}

const ORDER_STATUS: Record<string, string> = {
  pending: 'Modtaget', processing: 'Under behandling', completed: 'Afsluttet', cancelled: 'Annulleret',
}

type OrderRow = {
  id: string; order_number: string | null; ordered_at: string; order_total: number | null
  status: string; access_token: string | null; line_items: { qty?: number }[] | null
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const user = await getShopUser()
  if (!user) {
    const { login } = await searchParams
    return <LoginForm notice={login ? LOGIN_NOTICES[login] : undefined} />
  }

  const supabase = createServiceClient()
  const [{ data: lifecycle }, { data: orders }] = await Promise.all([
    supabase.from('customer_product_lifecycle')
      .select(LIFECYCLE_COLUMNS)
      .eq('shop_user_id', user.id)
      .gte('due_date', addDays(-730))
      .order('due_date'),
    supabase.from('orders')
      .select('id, order_number, ordered_at, order_total, status, access_token, line_items')
      .eq('shop_user_id', user.id)
      .order('ordered_at', { ascending: false })
      .limit(50),
  ])

  const rows   = (lifecycle ?? []) as unknown as LifecycleRow[]
  const soon   = rows.filter(r => r.due_date <= addDays(180))
  const later  = rows.filter(r => r.due_date >  addDays(180))
  const greet  = user.name?.split(' ')[0] ?? user.email ?? user.phone

  return (
    <div className="ls-account">
      <div className="ls-listing-header">
        <h1>Hej {greet}</h1>
        <form action={logout}><button className="ls-account-linkbtn">Log ud</button></form>
      </div>

      <section className="ls-account-section">
        <h2>Kommende udskiftninger og eftersyn</h2>
        <p className="ls-account-lead">
          Ud fra dine køb og produkternes forventede levetid. Udstyr der er slidt op, kan svigte når du har mest brug for det.
        </p>
        {soon.length === 0 ? (
          <p className="ls-account-empty">
            {rows.length === 0
              ? 'Ingen af dine køb har en registreret levetid endnu.'
              : 'Intet forfalder det næste halve år.'}
          </p>
        ) : (
          <ul className="ls-life-list">
            {soon.map(r => <LifeItem key={`${r.order_id}-${r.product_id}`} r={r} />)}
          </ul>
        )}
        {later.length > 0 && (
          <details className="ls-account-later">
            <summary>Senere ({later.length})</summary>
            <ul className="ls-life-list">
              {later.map(r => <LifeItem key={`${r.order_id}-${r.product_id}`} r={r} />)}
            </ul>
          </details>
        )}
      </section>

      <section className="ls-account-section">
        <h2>Dine ordrer</h2>
        {(orders ?? []).length === 0 ? (
          <p className="ls-account-empty">Ingen ordrer endnu. <Link href="/kategorier">Find udstyr</Link></p>
        ) : (
          <ul className="ls-account-orders">
            {(orders as OrderRow[]).map(o => {
              const items = (o.line_items ?? []).reduce((s, l) => s + (Number(l.qty) || 1), 0)
              const inner = (
                <>
                  <span className="ls-account-order-no">{o.order_number ?? 'Ordre'}</span>
                  <span>{fmtDate(o.ordered_at)}</span>
                  <span>{items} {items === 1 ? 'vare' : 'varer'}</span>
                  <span>{ORDER_STATUS[o.status] ?? o.status}</span>
                  <strong>{o.order_total != null ? fmtKr(Number(o.order_total)) : ''}</strong>
                </>
              )
              return (
                <li key={o.id}>
                  {o.access_token
                    ? <Link href={`/checkout/bekraeftelse/${o.id}?t=${o.access_token}`}>{inner}</Link>
                    : <div>{inner}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="ls-account-section">
        <h2>Nyheder og påmindelser</h2>
        <form action={setMarketing} className="ls-account-consent">
          <input type="hidden" name="on" value={user.marketing_opt_in ? '0' : '1'} />
          <p>
            {user.marketing_opt_in
              ? 'Du får besked på e-mail, når dit udstyr nærmer sig udskiftning, samt nyheder og tilbud.'
              : 'Du får ikke påmindelser om udskiftning eller nyheder fra os.'}
          </p>
          <button className={user.marketing_opt_in ? 'ls-account-linkbtn' : 'ls-btn-primary'}>
            {user.marketing_opt_in ? 'Afmeld' : 'Ja tak, giv mig besked'}
          </button>
        </form>
        <p className="ls-account-fine">
          Logget ind som {[user.email, user.phone].filter(Boolean).join(' · ')}
        </p>
      </section>
    </div>
  )
}
