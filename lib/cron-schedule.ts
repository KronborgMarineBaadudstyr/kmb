import vercel from '@/vercel.json'

// De automatiske kørsler læses direkte fra vercel.json (tidspunkter i UTC) og vises i dansk tid på Leverandører.
// Nye cron-ruter skal have en linje i ROUTES for at blive vist.
const ROUTES: Record<string, { supplier: string; kind: 'products' | 'stock' }> = {
  '/api/cron/sync-engholm':        { supplier: 'Engholm',         kind: 'products' },
  '/api/cron/sync-scanmarine':     { supplier: 'Scanmarine',      kind: 'products' },
  '/api/cron/sync-palby-products': { supplier: 'Palby',           kind: 'products' },
  '/api/cron/sync-palby-stock':    { supplier: 'Palby',           kind: 'stock' },
  '/api/cron/sync-columbus':       { supplier: 'Columbus Marine', kind: 'products' },
  '/api/cron/sync-kaphorn':        { supplier: 'Kap-Horn',        kind: 'products' },
  '/api/cron/sync-kaphorn-stock':  { supplier: 'Kap-Horn',        kind: 'stock' },
}

export type ScheduleLine = { kind: 'products' | 'stock'; text: string }

// "0 23 * * *" → "dagligt kl. 00.00" (dansk tid). Andre mønstre vises som de står.
function describe(cron: string): string {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/)
  const hours = hour?.split(',') ?? []
  if (dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(min ?? '') && hours.every(h => /^\d+$/.test(h))) {
    const times = hours.map(h => {
      const d = new Date(Date.UTC(2000, 0, 1, Number(h), Number(min)))   // tidspunktet på dagen er det samme hele året, kun sommer/vinter skifter
      const now = new Date(); d.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      return d.toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' })
    })
    return `dagligt kl. ${times.join(', ')}`
  }
  return cron
}

export function scheduleFor(supplier: string): ScheduleLine[] {
  return (vercel.crons ?? [])
    .filter(c => ROUTES[c.path]?.supplier === supplier)
    .map(c => ({ kind: ROUTES[c.path].kind, text: describe(c.schedule) }))
}
