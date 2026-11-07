import Link from 'next/link'
import { type LifecycleRow, dueStatus, fmtDate, lifespanLabel } from '@/lib/shop/lifecycle'

export function LifeItem({ r }: { r: LifecycleRow }) {
  const due = dueStatus(r.due_date)
  return (
    <li className={`ls-life-item ls-life-item--${due.tone}`}>
      <span className="ls-checkout-line-thumb">
        {r.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={r.image_url} alt="" />
          : '⚓'}
      </span>
      <span className="ls-life-body">
        <strong>{r.line_name}</strong>
        <small>
          Købt {fmtDate(r.purchased_at)} · levetid ca. {lifespanLabel(r.lifespan_months)}
          {r.lifespan_note ? ` · ${r.lifespan_note}` : ''}
        </small>
      </span>
      <span className="ls-life-due">{due.label}</span>
      <Link href={`/produkt/${r.shop_product_id}`} className="ls-life-cta">Se produkt</Link>
    </li>
  )
}
