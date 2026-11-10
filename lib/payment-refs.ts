import { createServiceClient } from '@/lib/supabase/server'

// Delvise kortnumre som reference til kunden (migration 068). Gemmer aldrig det fulde kortnummer:
// kun sidste 4 cifre + evt. de første 6–8 (kortudsteder), korttype og udløb.
// Kilder: 'manual' (indtastet ved afhentning), 'pos' (admind — når integrationen findes), 'online' (Swedbank Pay).

export type CardRef = { last4: string; bin?: string | null; brand?: string | null; expiry?: string | null }
export type CardSource = 'pos' | 'online' | 'manual'

// Læser et kortnummer som det står på kvitteringen: "1234", "**** 1234", "492500******1234", "4925 00XX XXXX 1234"
export function parseCardInput(raw: string, binRaw = ''): CardRef | null {
  const s = raw.replace(/\s|-/g, '')
  const masked = s.match(/^(\d{6,8})?[*xX•.]*(\d{4})$/)
  if (!masked) return null
  const bin = (binRaw.replace(/\D/g, '') || masked[1] || '').slice(0, 8)
  return { last4: masked[2], bin: /^\d{6,8}$/.test(bin) ? bin : null }
}

// Fra Swedbank Pay / POS: "492500******0004" → { bin: "492500", last4: "0004" }
export function fromMaskedPan(maskedPan: string, extra: Omit<CardRef, 'last4' | 'bin'> = {}): CardRef | null {
  const ref = parseCardInput(maskedPan)
  return ref ? { ...ref, ...extra } : null
}

export const maskCard = (c: { card_last4?: string; last4?: string; card_bin?: string | null; bin?: string | null }) => {
  const last4 = c.card_last4 ?? c.last4 ?? '????'
  const bin = c.card_bin ?? c.bin
  return bin ? `${bin.slice(0, 4)} ${bin.slice(4)}•• •••• ${last4}` : `•••• ${last4}`
}

// Husk kortet på kunden (og ordren). Fejler stille — betaling/afhentning må aldrig blokeres af dette.
export async function rememberCard(opts: { shopUserId: string | null; orderId?: string | null; card: CardRef; source: CardSource }) {
  const supabase = createServiceClient()
  const { card, source } = opts
  if (opts.orderId) {
    await supabase.from('orders').update({ payment_card: { ...card, source } }).eq('id', opts.orderId)
  }
  if (!opts.shopUserId) return
  let q = supabase.from('customer_payment_refs').select('id, times_seen')
    .eq('shop_user_id', opts.shopUserId).eq('card_last4', card.last4)
  q = card.bin ? q.eq('card_bin', card.bin) : q.is('card_bin', null)
  q = card.expiry ? q.eq('card_expiry', card.expiry) : q.is('card_expiry', null)
  const { data: existing, error } = await q.maybeSingle()
  if (error) { console.error('[kort] kunne ikke slå kort op:', error.message); return }
  const now = new Date().toISOString()
  const res = existing
    ? await supabase.from('customer_payment_refs').update({
        times_seen: (existing.times_seen ?? 1) + 1, last_seen_at: now, last_order_id: opts.orderId ?? null,
        ...(card.brand ? { card_brand: card.brand } : {}),
      }).eq('id', existing.id)
    : await supabase.from('customer_payment_refs').insert({
        shop_user_id: opts.shopUserId, card_last4: card.last4, card_bin: card.bin ?? null, card_brand: card.brand ?? null,
        card_expiry: card.expiry ?? null, source, last_order_id: opts.orderId ?? null,
      })
  if (res.error) console.error('[kort] kunne ikke gemme kort:', res.error.message)
}

export type CardMatch = {
  shop_user_id: string; name: string | null; email: string | null; phone: string | null
  card: string; brand: string | null; times_seen: number; last_seen_at: string
  exact: boolean            // udsteder (BIN) passer også — mere sikkert end kun sidste 4 cifre
}

// Kunder der har betalt med et kort, der passer. Kun sidste 4 cifre giver ofte flere bud — derfor spørges der.
export async function findCustomersByCard(card: CardRef): Promise<CardMatch[]> {
  const { data, error } = await createServiceClient().from('customer_payment_refs')
    .select('shop_user_id, card_last4, card_bin, card_brand, times_seen, last_seen_at, shop_users ( name, email, phone )')
    .eq('card_last4', card.last4)
    .order('last_seen_at', { ascending: false })
    .limit(50)
  if (error) return []
  type Row = { shop_user_id: string; card_last4: string; card_bin: string | null; card_brand: string | null; times_seen: number; last_seen_at: string
               shop_users: { name: string | null; email: string | null; phone: string | null } | null }
  const rows = (data ?? []) as unknown as Row[]
  const usable = card.bin ? rows.filter(r => !r.card_bin || r.card_bin.startsWith(card.bin!.slice(0, 6))) : rows
  const best = new Map<string, CardMatch>()
  for (const r of usable) {
    const exact = !!card.bin && !!r.card_bin
    const m: CardMatch = {
      shop_user_id: r.shop_user_id, name: r.shop_users?.name ?? null, email: r.shop_users?.email ?? null, phone: r.shop_users?.phone ?? null,
      card: maskCard(r), brand: r.card_brand, times_seen: r.times_seen, last_seen_at: r.last_seen_at, exact,
    }
    const prev = best.get(r.shop_user_id)
    if (!prev || (exact && !prev.exact) || m.times_seen > prev.times_seen) best.set(r.shop_user_id, m)
  }
  return [...best.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || b.times_seen - a.times_seen || b.last_seen_at.localeCompare(a.last_seen_at))
}
