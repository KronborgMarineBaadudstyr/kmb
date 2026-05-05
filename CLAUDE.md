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
    staging/            # Gennemgang af ukendte leverandørprodukter (needs_review + pending_review)
    matching/           # Cross-supplier produktmatch + oprettelse af draft-produkter
    products/           # Produktkatalog
    inventory/          # Lagerbeholdning
  api/
    import/             # SSE-streams til manuel import (engholm, palby, scanmarine, columbus, kaphorn)
    cron/               # Vercel cron endpoints
    suppliers/          # CRUD leverandører + PATCH sync_state
    staging/            # GET list, [id]/suggestions, [id]/action
    matching/           # run (SSE), groups (GET), [id] (PATCH), [id]/create-product (POST)
    products/           # Produkter
lib/
  importers/            # columbus.ts, engholm.ts, palby.ts, scanmarine.ts, kaphorn.ts, hf-industri.ts
  matching-engine.ts    # runMatchingEngine() — EAN + fuzzy navn gruppering
  product-creator.ts    # createProductFromGroup() — draft produkt + product_suppliers
  review-checker.ts     # flagRecentlyImportedForReview() — needs_review efter import
  supabase/             # client.ts, server.ts
  cron-auth.ts          # verifyCronRequest() — Bearer CRON_SECRET
supabase/
  migrations/           # 001–011 SQL filer (køres manuelt i Supabase SQL Editor)
  local/                # gitignored — credentials SQL filer
vercel.json             # Cron job schedules
```

## Leverandører

| Navn | Format | Status |
|------|--------|--------|
| Engholm | API (JSON) | ✅ Implementeret |
| Palby | FTP CSV + XML lager | ✅ Implementeret |
| Scanmarine | CSV download (URL) | ✅ Implementeret |
| Columbus Marine | FTP XML | ✅ Implementeret |
| Kap-Horn | FTP XML | ✅ Implementeret |
| HF Industri | FTP CSV | ✅ Implementeret |

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
- `007_columbus_supplier.sql` — Columbus Marine leverandør-række ✅ kørt
- `008_hf_industri_supplier.sql` — HF Industri leverandør-række ✅ kørt
- `009_kaphorn_supplier.sql` — Kap-Horn leverandør-række ✅ kørt
- `010_needs_review_status.sql` — `needs_review` status på staging ✅ kørt
- `011_staging_match_groups.sql` — `staging_match_groups` tabel + `normalize_for_matching()` + `find_fuzzy_staging_matches()` RPC ✅ kørt

## Cron Jobs (vercel.json)
| Endpoint | Schedule | Beskrivelse |
|----------|----------|-------------|
| `/api/cron/sync-engholm` | 23:00 dagligt | Engholm produktimport |
| `/api/cron/sync-scanmarine` | 06:00 dagligt | Scanmarine produktimport |
| `/api/cron/sync-palby-products` | 23:00 dagligt | Palby produktimport (fuld CSV) |
| `/api/cron/sync-palby-stock` | 07, 12, 17, 22 dagligt | Palby lager delta-sync |
| `/api/cron/sync-columbus` | 23:00 dagligt | Columbus Marine produktimport |
| `/api/cron/sync-kaphorn` | 23:00 dagligt | Kap-Horn produktimport |

## Staging-flow
1. Import matcher på EAN mod `products` tabellen
2. Match → opdaterer `product_suppliers`; `review-checker` flagger matchede produkter med manglende data som `needs_review`
3. Ingen match → indsætter i `supplier_product_staging` med `status = 'pending_review'`
4. Admin reviewer i `/staging` UI:
   - Fuzzy navn-søgning via `fuzzy_product_search()` RPC
   - Actions: match til eksisterende produkt / opret nyt / afvis / genåbn / marker som set (needs_review)

## Matching-flow (cross-supplier produktoprettelse)
1. Kør `/matching` → "Kør matching" → `runMatchingEngine()` kører tre faser:
   - **EAN-fase**: Grupper staging-rækker med samme EAN på tværs af leverandører (høj konfidens)
   - **Fuzzy-fase**: `find_fuzzy_staging_matches()` RPC + union-find clustering (medium konfidens, ≥0.65 på normaliseret navn)
   - **Singles-fase**: Resterende rækker uden gruppe → enkelt-leverandør grupper
2. Admin gennemgår grupper i `/matching` UI:
   - Vælger navn (manuelt fra dropdown af leverandørnavne)
   - Sætter leverandørprioritet (priority 1 = tages fra først)
   - Bekræfter → "Opret produkt" → `createProductFromGroup()`
3. `createProductFromGroup()` opretter `products` (status: draft) + `product_suppliers` med priority
4. Staging-rækker sættes til `matched`

### normalize_for_matching()
SQL-funktion der stripper farver (rød/blå/sort/etc.) og retningsord inden fuzzy-sammenligning, så `"Rød ankerkæde 10mm"` og `"Sort ankerkæde 10mm"` matches korrekt, mens `"10mm"` vs `"12mm"` ikke giver falsk match.

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

### I gang / næste skridt
- [ ] **Kør matching** — åbn `/matching`, tryk "Kør matching", vurder grupperingskvalitet
- [ ] **Gennemgå match-grupper** — bekræft høj-konfidens grupper, opret draft-produkter
- [ ] **Sync interval** — Kap-Horn viser "Hver 8760 timer". Juster så alle leverandører viser samme daglige interval.

### Fremtidige features
- [ ] **Produktredigering** — `/products/[id]` side til at redigere navn, beskrivelse, pris, billeder inden Woo-push
- [ ] **Supabase → WooCommerce** produkt-sync (push validerede draft-produkter til Woo)
- [ ] **Woo → Supabase** løbende lagersync (webhook fra Woo ved salg)
- [ ] **Eget lager justering** — manuel lageroptælling UI + POS webhook
- [ ] **Staging batch-behandling** — godkend/afvis mange ad gangen
- [ ] **admind POS integration** — venter på API docs
- [ ] **Fuzzy match udvidelse** — overvej flere ord/adjektiver der skal nedvurderes ud over farver

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
