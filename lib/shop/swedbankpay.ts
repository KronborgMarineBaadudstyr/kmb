import { createServiceClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/secrets'

// Swedbank Pay — Online Payments / Checkout v3.1, redirect-integration.
// Dokumentation: developer.swedbankpay.com/checkout-v3/ (payment-request, validate-status, post-purchase, callback)
//
//   1. POST /psp/paymentorders            → operation rel "redirect-checkout" (kunden sendes dertil)
//   2. Kunden kommer tilbage til completeUrl (siger IKKE at betalingen lykkedes) → GET paymentorder?$expand=paid
//   3. status "Paid" + paid.transactionType "Authorization" = beløbet er reserveret (kort, MobilePay)
//      "Sale" = trukket med det samme
//   4. Capture (POST …/captures) når varen sendes/udleveres — dansk regel: først trække ved levering
//      Cancel  (POST …/cancellations) hvis ordren annulleres før capture
//   Callback (POST til callbackUrl) er en sikkerhedsnet: vi henter altid status med GET selv.
//
// Opsætning: Indstillinger → Betaling (/admin/betaling, kun ejere) — gemmes krypteret i app_settings
// ('swedbankpay'). Fallback: env SWEDBANK_PAY_TOKEN, SWEDBANK_PAY_PAYEE_ID, SWEDBANK_PAY_ENV=test|prod.

export const SWEDBANK_SETTING = 'swedbankpay'
export type SwedbankEnv = 'test' | 'prod'
export type SwedbankConfig = { token: string; payeeId: string; env: SwedbankEnv; payeeName?: string }

const BASE: Record<SwedbankEnv, string> = {
  test: 'https://api.externalintegration.payex.com',
  prod: 'https://api.payex.com',
}

export async function resolveSwedbankConfig(): Promise<{ config: SwedbankConfig | null; source: 'shop' | 'env' | null; hint: string | null; updated_at: string | null; updated_by: string | null; unreadable: boolean }> {
  const { data: row, error } = await createServiceClient().from('app_settings')
    .select('value, hint, updated_at, updated_by').eq('key', SWEDBANK_SETTING).maybeSingle()
  const plain = !error && row ? decryptSecret(row.value) : null
  if (row && plain) {
    try {
      const c = JSON.parse(plain) as SwedbankConfig
      if (c.token && c.payeeId) return { config: { ...c, env: c.env === 'prod' ? 'prod' : 'test' }, source: 'shop', hint: row.hint, updated_at: row.updated_at, updated_by: row.updated_by, unreadable: false }
    } catch { /* falder igennem */ }
  }
  const token = process.env.SWEDBANK_PAY_TOKEN?.trim(), payeeId = process.env.SWEDBANK_PAY_PAYEE_ID?.trim()
  const config = token && payeeId ? { token, payeeId, env: (process.env.SWEDBANK_PAY_ENV === 'prod' ? 'prod' : 'test') as SwedbankEnv } : null
  return { config, source: config ? 'env' : null, hint: token ? token.slice(-4) : null, updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null, unreadable: !!row && !plain }
}

export class SwedbankError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function call<T>(cfg: SwedbankConfig, method: 'GET' | 'POST' | 'PATCH', pathOrUrl: string, body?: unknown): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE[cfg.env]}${pathOrUrl}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(method === 'GET' ? { Accept: 'application/json;version=3.1' } : { 'Content-Type': 'application/json;version=3.1', Accept: 'application/json;version=3.1' }),
      'User-Agent': 'LoveSailing/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) {
    // Swedbank svarer med "problem"-JSON: { title, detail, problems: [{ name, description }] }
    const detail = (json?.detail as string) || (json?.title as string) || `HTTP ${res.status}`
    const problems = Array.isArray(json?.problems) ? (json!.problems as { name?: string; description?: string }[]).map(p => `${p.name}: ${p.description}`).join('; ') : ''
    throw new SwedbankError(`Swedbank Pay: ${detail}${problems ? ` (${problems})` : ''}`, res.status, json)
  }
  return json as T
}

type Operation = { rel: string; href: string; method: string }
export type PaidDetails = { maskedPan?: string; cardBrand?: string; expiryDate?: string; bin?: string }
export type PaymentOrderResponse = {
  paymentOrder: {
    id: string; status: 'Initialized' | 'Paid' | 'Failed' | 'Cancelled' | 'Aborted' | string
    amount: number; vatAmount: number
    remainingCaptureAmount?: number; remainingCancellationAmount?: number
    paid?: { id: string; instrument?: string; transactionType?: 'Authorization' | 'Sale' | string; amount?: number; details?: PaidDetails }
  }
  operations: Operation[]
}

export const toMinor = (kr: number) => Math.round(kr * 100)
export const vatOf   = (minor: number) => Math.round(minor / 5)          // 25 % moms inkluderet i beløbet → moms = beløb/5

// Unik reference pr. handling (Swedbank: A-Za-z0-9, højst 30 tegn — bruges til "exactly-once")
export function payeeReference(orderNumber: string, kind: 'P' | 'C' | 'X'): string {
  const base = orderNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 14)
  return `${base}${kind}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 30)
}

export async function createPaymentOrder(cfg: SwedbankConfig, o: {
  orderNumber: string; total: number; userAgent: string; site: string
  completeUrl: string; cancelUrl: string; callbackUrl: string; termsUrl: string
}): Promise<{ id: string; redirectUrl: string; payeeReference: string }> {
  const amount = toMinor(o.total)
  const ref = payeeReference(o.orderNumber, 'P')
  const r = await call<PaymentOrderResponse>(cfg, 'POST', '/psp/paymentorders', {
    paymentOrder: {
      operation:   'Purchase',
      currency:    'DKK',
      amount,
      vatAmount:   vatOf(amount),
      description: `Ordre ${o.orderNumber} — LoveSailing`.slice(0, 40),
      userAgent:   o.userAgent || 'Mozilla/5.0',
      language:    'da-DK',
      urls: {
        hostUrls:          [o.site],
        completeUrl:       o.completeUrl,
        cancelUrl:         o.cancelUrl,
        callbackUrl:       o.callbackUrl,
        termsOfServiceUrl: o.termsUrl,
      },
      payeeInfo: {
        payeeId:        cfg.payeeId,
        payeeReference: ref,
        payeeName:      cfg.payeeName || 'LoveSailing',
        orderReference: o.orderNumber,
      },
    },
  })
  const redirect = r.operations?.find(op => op.rel === 'redirect-checkout')?.href
  if (!redirect) throw new SwedbankError('Swedbank Pay returnerede ingen betalingsside (redirect-checkout)', 502, r)
  return { id: r.paymentOrder.id, redirectUrl: redirect, payeeReference: ref }
}

export function getPaymentOrder(cfg: SwedbankConfig, id: string) {
  return call<PaymentOrderResponse>(cfg, 'GET', `${id}?$expand=paid`)
}

function operation(po: PaymentOrderResponse, rel: string): string | null {
  return po.operations?.find(op => op.rel === rel)?.href ?? null
}

// Træk det reserverede beløb (hele eller en del). Kræver operationen "capture" på betalingen.
export async function capturePayment(cfg: SwedbankConfig, id: string, orderNumber: string, amountKr?: number) {
  const po = await getPaymentOrder(cfg, id)
  const href = operation(po, 'capture')
  if (!href) throw new SwedbankError('Betalingen kan ikke trækkes (ingen capture-operation — allerede trukket, annulleret eller ikke betalt)', 409, po)
  const amount = amountKr != null ? toMinor(amountKr) : (po.paymentOrder.remainingCaptureAmount ?? po.paymentOrder.amount)
  return call<unknown>(cfg, 'POST', href, {
    transaction: { description: `Levering af ordre ${orderNumber}`.slice(0, 40), amount, vatAmount: vatOf(amount), payeeReference: payeeReference(orderNumber, 'C') },
  })
}

// Frigiv reservationen (ordre annulleret før capture)
export async function cancelPayment(cfg: SwedbankConfig, id: string, orderNumber: string) {
  const po = await getPaymentOrder(cfg, id)
  const href = operation(po, 'cancel')
  if (!href) throw new SwedbankError('Betalingen kan ikke annulleres (ingen cancel-operation — allerede trukket eller ikke reserveret)', 409, po)
  return call<unknown>(cfg, 'POST', href, {
    transaction: { description: `Ordre ${orderNumber} annulleret`.slice(0, 40), payeeReference: payeeReference(orderNumber, 'X') },
  })
}

// Tjek at token og Payee ID virker (opretter intet). Et GET på en ukendt betaling giver 404 ved gyldigt token, 401 ved ugyldigt.
export async function checkSwedbankConfig(cfg: SwedbankConfig): Promise<string | null> {
  try {
    await call(cfg, 'GET', '/psp/paymentorders/00000000-0000-0000-0000-000000000000')
    return null
  } catch (e) {
    if (e instanceof SwedbankError) {
      if (e.status === 401 || e.status === 403) return `Swedbank Pay (${cfg.env === 'test' ? 'test' : 'produktion'}) afviste access token`
      return null    // 404/400 = token accepteret
    }
    return `Kunne ikke nå Swedbank Pay: ${e instanceof Error ? e.message : String(e)}`
  }
}
