# KronborgMarine Bådudstyr — PIM/Middleware System

Central middleware der forbinder leverandører, Supabase (master database), WooCommerce og admind POS.

## Tech Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL) — cloud, service role key til server-side
- **FTP:** `basic-ftp` pakke
- **XML parsing:** `fast-xml-parser`
- **WooCommerce:** `@woocommerce/woocommerce-rest-api`
- **Cron jobs:** Vercel Cron (vercel.json) med `CRON_SECRET` Bearer token auth

## Projekt-struktur
```
app/
  (dashboard)/          # Admin UI
    page.tsx            # Dashboard
    suppliers/          # Leverandøroversigt + manuel import-trigger
    staging/            # Gennemgang af ukendte leverandørprodukter
    products/           # Produktkatalog
    inventory/          # Lagerbeholdning
  api/
    import/             # SSE-streams til manuel import (engholm, palby, scanmarine)
    cron/               # Vercel cron endpoints (sync-engholm, sync-palby-products, sync-palby-stock, sync-scanmarine)
    suppliers/          # CRUD leverandører
    staging/            # GET list, [id]/suggestions, [id]/action
    products/           # Produkter
lib/
  importers/            # columbus.ts, engholm.ts, palby.ts, scanmarine.ts
  supabase/             # client.ts, server.ts
  cron-auth.ts          # verifyCronRequest() — Bearer CRON_SECRET
supabase/
  migrations/           # 001–006 SQL filer (køres manuelt i Supabase SQL Editor)
  local/                # gitignored — credentials SQL filer
vercel.json             # Cron job schedules
```

## Leverandører

| Navn | Format | Status |
|------|--------|--------|
| Engholm | API (JSON) | ✅ Implementeret |
| Palby | FTP CSV + XML lager | ✅ Implementeret |
| Scanmarine | CSV download (URL) | ✅ Implementeret |
| Columbus Marine | FTP XML | ✅ Importer skrevet, mangler migration + cron |

### Palby FTP detaljer
- Host: `52.149.120.1`, Port: 21
- Produktfil: `/webcataloginventitems_flat_da_full.csv` (Windows-1252 encoding, komma-separeret)
- Filter: `CatalogElementType === 'Single'` (skip Master)
- Lagerfil (fuld): `/web_stockstatus_newitemid.xml`
- Lager delta-filer: `/delta/web_stockstatus_newitemid_delta_*.xml`
- Credentials gemmes i `supabase/local/palby_credentials.sql` (gitignored)

### Columbus Marine FTP detaljer
- Host: `webshop.columbus-marine.dk`, Port: 21
- Produktfil: `/V30/ColumbusStock.xml` (UTF-8 XML)
- Felter: ItemId, Text, InStock, SalesPrice, GrossSalesPrice, EAN, Height, Length, Width, NetWeight, PipedItemDetailsText, CatParent, CatChild
- Credentials: user=`KronborgMarine`, pw=`jn4j8Mk8g5Xy!G` (CASE SENSITIVE)
- Gemmes i `supabase/local/columbus_credentials.sql` (gitignored — skal oprettes)

### Scanmarine
- CSV download URL: `https://scanmarine.dk/api/produkter`
- Semikolon-separeret, dansk talformat (1.234,56)

## Database migrations
Køres **manuelt** i Supabase SQL Editor i denne rækkefølge:
- `001_initial_schema.sql` — alle kernetabeller
- `002_supplier_staging.sql` — `supplier_product_staging` tabel
- `003_fuzzy_search_rpc.sql` — `fuzzy_product_search()` RPC (kræver pg_trgm extension)
- `004_palby_supplier.sql` — Palby leverandør-række
- `005_supplier_sync_state.sql` — `sync_state jsonb` kolonne på suppliers
- `006_scanmarine_supplier.sql` — Scanmarine leverandør-række

**Mangler endnu (ikke kørt):**
- `007_columbus_supplier.sql` — Columbus Marine leverandør-række (skal oprettes)

## Cron Jobs (vercel.json)
| Endpoint | Schedule | Beskrivelse |
|----------|----------|-------------|
| `/api/cron/sync-engholm` | 23:00 dagligt | Engholm produktimport |
| `/api/cron/sync-scanmarine` | 06:00 dagligt | Scanmarine produktimport |
| `/api/cron/sync-palby-products` | 23:00 dagligt | Palby produktimport (fuld CSV) |
| `/api/cron/sync-palby-stock` | 07, 12, 17, 22 dagligt | Palby lager delta-sync |

**Mangler:** Columbus cron + Columbus i vercel.json

## Staging-flow
1. Import matcher på EAN mod `products` tabellen
2. Match → opdaterer `product_suppliers`
3. Ingen match → indsætter i `supplier_product_staging` med `status = 'pending_review'`
4. Admin reviewer i `/staging` UI:
   - Fuzzy navn-søgning via `fuzzy_product_search()` RPC
   - Actions: match til eksisterende produkt / opret nyt / afvis / genåbn

## Env Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WOO_BASE_URL=
WOO_CONSUMER_KEY=
WOO_CONSUMER_SECRET=
WOO_WEBHOOK_SECRET=
CRON_SECRET=          # Bruges af verifyCronRequest() — sæt også i Vercel dashboard
```

## TODO — Udestående opgaver

### Kritiske / næste skridt
- [ ] **Columbus Marine migration** — opret `supabase/migrations/007_columbus_supplier.sql` og kør i Supabase
- [ ] **Columbus credentials SQL** — opret `supabase/local/columbus_credentials.sql` (gitignored) og kør
- [ ] **Columbus cron** — tilføj `/api/cron/sync-columbus/route.ts` + entry i `vercel.json`
- [ ] **Columbus i IMPORT_CONFIG** — tilføj Columbus i `app/(dashboard)/suppliers/page.tsx`
- [ ] **CRON_SECRET** — tilføj env-variabel i Vercel dashboard

### Verification / test
- [ ] **Migration 003** (fuzzy_product_search RPC) — bekræft kørt i Supabase
- [ ] **Staging UI** — test i browser, verificer fuzzy match virker
- [ ] **Palby produktimport** — kør igen efter CSV-rewrite og verificer produkter dukker op i staging
- [ ] **Palby 'Lager fuld'** — kør som baseline efter produktimport virker

### Fremtidige features
- [ ] Woo → Supabase løbende lagersync (webhook)
- [ ] Staging batch-behandling (godkend/afvis mange ad gangen)
- [ ] Supabase → WooCommerce produkt-sync (push validerede produkter til Woo)
- [ ] admind POS integration (venter på API docs)

## Vigtige kodningsmønstre

### SSE import route (standard skabelon)
```typescript
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!
  const stream = new ReadableStream({ start(c) { ctrl = c } })
  const send = (data: object) => ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  ;(async () => {
    try { await importXxx(send, options) }
    catch (e) { send({ stage: 'error', message: String(e), ... }) }
    finally { ctrl.close() }
  })()
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
```

### Cron route (standard skabelon)
```typescript
import { verifyCronRequest } from '@/lib/cron-auth'
export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ...
}
```

### FTP download (standard)
```typescript
async function downloadFile(client: ftp.Client, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  const writable = new Writable({ write(chunk, _, cb) { chunks.push(chunk); cb() } })
  await client.downloadTo(writable, remotePath)
  return Buffer.concat(chunks)
}
```
