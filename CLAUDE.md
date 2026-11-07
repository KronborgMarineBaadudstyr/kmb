# KronborgMarine Bådudstyr — PIM/Middleware System

Central middleware der forbinder leverandører, Supabase (master database), egen webshop (LoveSailing.dk, `app/(shop)`) og admind POS.
Ingen WooCommerce-integration — shop og betaling bygges selv. Kolonnerne `woo_product_id`/`woo_bestillingsnummer` er historiske data fra engangsimporten (bestillingsnr. bruges i søgning).

## Tech Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL) — cloud, service role key til server-side
- **FTP:** `basic-ftp` pakke
- **XML parsing:** `fast-xml-parser`
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
- … (012–049 ✅ kørt)
- `050_variant_of_product.sql` — `products.variant_of_product_id` (skjuler absorberede varianter fra grids) ✅ kørt
- `051_shop_users_saved_carts.sql` — `shop_users` (kunder, ikke admin) + `saved_carts` ✅ kørt
- `052_shop_orders.sql` — `orders` udvidet til webshop-ordrer (ordrenr. LS-10001+, betalingsstatus, access_token) ⏳ skal køres
- `053_rls_lockdown.sql` — RLS på alle tabeller + fjerner anon/authenticated-rettigheder (appen bruger kun service role) ⏳ skal køres
- `055_pay_at_pickup.sql` — `shop_users.pay_at_pickup_allowed`, `orders.payment_method/ready_at/paid_at` ⏳ skal køres
- `054_customer_accounts_lifecycle.sql` — kundelogin (tokens/sessioner), `shop_users.phone`, `orders.ordered_at`, `products.expected_lifespan_months`, `customer_product_lifecycle` view, `lifecycle_reminders` ⏳ skal køres

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
CRON_SECRET=          # Bruges af verifyCronRequest() — sæt også i Vercel dashboard
RESEND_API_KEY=       # E-mail til "Gem kurv"-links (valgfri — uden den vises linket kun på skærmen)
```

## TODO — Udestående opgaver

### I gang / næste skridt
- [ ] **Kør matching** — åbn `/matching`, tryk "Kør matching", vurder grupperingskvalitet
- [ ] **Gennemgå match-grupper** — bekræft høj-konfidens grupper, opret draft-produkter
- [ ] **Sync interval** — Kap-Horn viser "Hver 8760 timer". Juster så alle leverandører viser samme daglige interval.

### Fremtidige features
- [x] **Produktredigering** — `/products/[id]` inline-redigering (navn, beskrivelse, pris, billeder inkl. overtag leverandørbilleder, varianter, SEO)
- [x] **Checkout uden betaling** — `/checkout` → `POST /api/shop/orders` → `/checkout/bekraeftelse/[id]?t=` + admin `/admin/orders`
- [ ] **Betalingsudbyder** — afventer valg (Stripe / Quickpay / Nets Easy / MobilePay); kobles på i `lib/shop/payment.ts`
- [ ] **Handelsbetingelser-side** — checkout kræver accept, men siden findes ikke endnu
- [x] **Kundelogin + levetid + påmindelser** — `/konto`, `/admin/lifecycle`, levetid på produkter
- [ ] **SMS-udbyder** til telefon-login (fx GatewayAPI/CPSMS) — kobles på i `lib/shop/sms.ts`
- [ ] **Import af gamle ordrer** (med e-mail eller telefon som kunde-id)
- [ ] **Lagertræk ved salg** — webshop-ordre og POS trækker fra eget lager i Supabase
- [ ] **Eget lager justering** — manuel lageroptælling UI + POS webhook
- [ ] **Staging batch-behandling** — godkend/afvis mange ad gangen
- [ ] **admind POS integration** — venter på API docs
- [ ] **Fuzzy match udvidelse** — overvej flere ord/adjektiver der skal nedvurderes ud over farver

## Checkout-flow
- Kurv ligger i `localStorage` (`ls_cart`); linje-id er `produktId` eller `produktId__variantId`
- `POST /api/shop/orders` genberegner pris (variant `sales_price` ?? produkt `sales_price`) og fragt (`lib/shop/shipping.ts`) — stol aldrig på klientens pris. 409 = priser ændret / vare utilgængelig (klienten retter kurven), 503 = databasefejl
- Betaling: `online` (slås til i `onlinePaymentAvailable()` når udbyder er koblet på `startPayment()`) eller `pickup` = betal ved afhentning
- Betal ved afhentning kræver login + kendt kunde (`payAtPickupEligible`: afsluttet eller gammel/importeret ordre, eller admin-overstyring i `/admin/customers`) + afhentning i butik — tjekkes på serveren
- Uden online betaling kan ukendte kunder ikke bestille (knappen er låst)
- Afhentningsflow i `/admin/orders`: Ny → Klar til afhentning (mail til kunden, én gang) → Afhentet og betalt
- Butikkens adresse/åbningstider til mails: `lib/shop/store.ts`
- Kvittering kræver `orders.access_token` i URL (kunden er ikke logget ind)
- E-mails via Resend (`lib/shop/email.ts`) — sendes kun hvis `RESEND_API_KEY` er sat
- **`middleware.ts` kræver admin-login på alt under `/api`**, undtagen `/api/shop/*`, `/api/cron/*` (egen Bearer), `/api/auth/login`, `/api/health` og `GET /api/products?shop=1`. Nye offentlige ruter skal lægges under `/api/shop/`
- Server actions går ikke gennem middleware — kald selv `isAdmin()` (`lib/admin-auth.ts`)

## Kundekonto & levetid
- Login uden adgangskode: `/konto` → `POST /api/shop/auth/request` (e-mail eller telefon) → mail med `/konto/login?token=` → knap → server action `verifyLogin` → cookie `ls_session`
- Linket kræver et klik på siden (mail-scannere må ikke bruge engangstokenet). Tokens 30 min, maks 5 pr. time pr. kunde
- Telefon-login: SMS-udbyder ikke valgt (`lib/shop/sms.ts`) — indtil da sendes linket til kundens e-mail, hvis den kendes
- Ved login knyttes gamle ordrer til kunden via `link_orders_to_shop_user()` — kun via den kanal kunden har bekræftet
- Importerede ordrer: sæt `ordered_at` (købsdato), `email` og/eller `customer_info.phone`, `line_items[].product_id` = vores produkt-UUID
- Levetid: `products.expected_lifespan_months` (+ `lifespan_note`). Forfald = `ordered_at` + levetid (view `customer_product_lifecycle`)
- `/admin/lifecycle` sender påmindelser (kun samtykke + e-mail, én gang pr. kunde/ordre/produkt). Afmelding via `/afmeld?t=`

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
