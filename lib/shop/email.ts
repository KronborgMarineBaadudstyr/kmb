// E-mail via Resend. Uden RESEND_API_KEY sendes intet (returnerer false), så flows virker lokalt.

const FROM = 'LoveSailing <no-reply@lovesailing.dk>'

export type Email = { to: string; subject: string; html: string; headers?: Record<string, string> }

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
  return res.ok
}

// Resends batch-API tager op til 100 mails pr. kald. Returnerer de mails der blev accepteret.
export async function sendEmailBatch(emails: Email[]): Promise<Email[]> {
  const key = process.env.RESEND_API_KEY
  if (!key) return []
  const sent: Email[] = []
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100)
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(e => ({ from: FROM, to: [e.to], subject: e.subject, html: e.html, headers: e.headers }))),
    })
    if (res.ok) sent.push(...chunk)
  }
  return sent
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function fmtKr(n: number): string {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
}
