# KronborgMarine Bådudstyr — PIM/Middleware System

Central middleware der forbinder leverandører, Supabase (master database), egen webshop (LoveSailing.dk, `app/(shop)`) og admind POS.
Ingen WooCommerce — shop og betaling bygges selv, og alle Woo-kolonner er fjernet (migration 072). Den gamle webshops ordrer ligger som `orders.source = 'old_webshop'`; `products.bestillingsnummer` (tidl. `woo_bestillingsnummer`) bruges i søgning. Ordrekilder vises med `orderSourceLabel()` (`lib/order-source.ts`).

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
- `052_shop_orders.sql` — `orders` udvidet til webshop-ordrer (ordrenr. LS-10001+, betalingsstatus, access_token) ✅ kørt
- `053_rls_lockdown.sql` — RLS på alle tabeller + fjerner anon/authenticated-rettigheder (appen bruger kun service role) ✅ kørt
- `054_customer_accounts_lifecycle.sql` — kundelogin (tokens/sessioner), `shop_users.phone`, `orders.ordered_at`, `products.expected_lifespan_months`, `customer_product_lifecycle` view, `lifecycle_reminders` ✅ kørt
- `055_pay_at_pickup.sql` — `shop_users.pay_at_pickup_allowed`, `orders.payment_method/ready_at/paid_at` ✅ kørt
- `056_admin_users.sql` — admin-konti med e-mail + magic link (`admin_users`, `admin_login_tokens`, `admin_sessions`), første ejer ✅ kørt
- `057_order_stock.sql` — `orders.stock_state` + `order_stock_apply()` (reservér/træk/frigiv eget lager pr. ordre, logges i `stock_adjustments`) ✅ kørt
- `058_price_history.sql` — `price_history` + triggere der logger hver ændring af salgs-/tilbudspris (produkter og varianter) ✅ kørt
- `059_sales_analytics.sql` — view `sales_lines` + `analytics_*()` (dækning, kategorier, topsælgere, måned, sæson, sæsontoppe, købes sammen, kategori-affinitet, prisændringer, kampagner, stk. pr. ordre) + `ai_conversations`/`ai_messages` ✅ kørt
- `060_ai_knowledge.sql` — `ai_knowledge` (butikkens egen viden til AI-assistenten) ✅ kørt
- `061_app_settings.sql` — `app_settings` (krypterede indstillinger, fx butikkens Anthropic-nøgle) ✅ kørt
- `062_fuzzy_matching_v2.sql` — `normalize_for_matching()` v2 + `matching_numbers()`/`numbers_compatible()` (talværn) i `find_fuzzy_staging_matches()` og `auto_match_staging_to_products()` ✅ kørt
- `063_category_performance.sql` — GIN-index på `products.categories` + `product_category_counts()` (alle brugte kategorier med antal i ét kald) ✅ kørt
- `064_match_group_variants.sql` — `staging_match_groups.create_as` ('same'/'variants') + `member_attributes` (egenskaber pr. vare) — admins valg i Saml ens varer ✅ kørt
- `065_variant_attributes.sql` — `variant_attributes` (fælles variant-egenskaber: navn, enhed, værdier med synonymer og rækkefølge), forudfyldt med Størrelse, Farve og varetypernes egenskaber ✅ kørt
- `066_follow_supplier_price.sql` — prisændringer slår igennem: følger vores salgspris leverandørens gamle vejl. pris (og leverandøren er foretrukken), sættes den til den nye; ellers beholdes vores egen pris. `import_change_log.price_action/our_price_old/our_price_new/variant_id` ✅ kørt
- `067_store_settings.sql` — `store_settings` (én række, `data` jsonb): firmanavn, CVR, adresse, kontakt, åbningstider, leveringstid, returfragt — redigeres på `/admin/butik` ✅ kørt
- `068_customer_payment_refs.sql` — `customer_payment_refs` (kunde ↔ delvist kortnummer: sidste 4 + evt. første 6, type, udløb, kilde pos/online/manual) + `orders.payment_card` ✅ kørt
- `069_shop_user_boats.sql` — `shop_user_boats` (kundens båd: navn, sejlbåd/motorbåd, længde i fod — én pr. kunde) ✅ kørt
- `070_payment_events.sql` — `payment_events` (log pr. ordre: oprettet, reserveret, trukket, annulleret, fejl) + index på `orders.payment_reference` ✅ kørt
- `071_sales_lines_returns.sql` — `sales_lines` læser negative antal (returer) og decimalantal (afrundes) korrekt — før talte en retur som +1 ✅ kørt
- `072_remove_woo.sql` — fjerner WooCommerce: dropper `woo_product_id`/`woo_sync_status`/`last_synced_woo_at`/`woo_variation_id`/`woo_order_id`/`woo_created_at`, omdøber `woo_bestillingsnummer` → `bestillingsnummer`, `orders.source` 'woo' → 'old_webshop' (ordrerne bevares) ⏳ skal køres

## Cron Jobs (vercel.json — tider i UTC; dansk tid = +1 om vinteren, +2 om sommeren)
| Endpoint | UTC | Beskrivelse |
|----------|-----|-------------|
| `/api/cron/sync-engholm` | 23:00 | Engholm produktimport |
| `/api/cron/sync-scanmarine` | 23:15 | Scanmarine produktimport |
| `/api/cron/sync-palby-products` | 23:30 | Palby produktimport (fuld CSV) |
| `/api/cron/sync-columbus` | 23:45 | Columbus Marine produktimport |
| `/api/cron/sync-kaphorn` | 00:00 | Kap-Horn produktimport |
| `/api/cron/sync-palby-stock` | 07:00 | Palby lager (delta) |
| `/api/cron/sync-kaphorn-stock` | 07:30 | Kap-Horn lager |

**Registrering af kørsler:** alle `/api/import/*` og `/api/cron/*` går gennem `trackImport()` (`lib/import-run.ts`), som gemmer `sync_state.last_run_started_at` ved start og `last_import_summary` + `last_products_summary`/`last_stock_summary` (resultat, kilde manuel/automatisk, varighed) ved slut — før done/error sendes til browseren. Leverandører (`/admin/suppliers`) viser automatiske tider læst fra `vercel.json` (`lib/cron-schedule.ts` — nye cron-ruter skal tilføjes i `ROUTES` dér), seneste kørsel pr. type og "Ufuldført" hvis en kørsel startede uden at blive færdig (fx Vercels tidsgrænse). Leverandørens `sync_interval_hours` bruges ikke til visning.

**Opdelte kørsler (Engholm, Palby, Columbus):** produktimporten kan ikke nå alle varer på Vercels 5 min, så den kører i dele á ca. 3½ min (`trackImport({ resumable, resume })` → `RunContext { resume, deadline }`). Varerne behandles sorteret efter varenummer (`remainingAfterCursor()`); når deadline er nået, melder importøren `partial` med en cursor (sidste varenummer + tællere), som gemmes i `sync_state.products_cursor`. Næste del kaldes med `?continue=1`: cron-ruterne svarer straks 202 og kører delen i `after()`, og kalder så sig selv (`lib/import-chain.ts`, Bearer CRON_SECRET); manuelle kørsler fortsættes af browseren. Afslutning (sidst synkroniseret, review-tjek fra kørslens start) sker kun i sidste del. Maks 30 dele; en ny kørsel uden `continue` starter forfra. Nye store importører: tag `RunContext` som option og tjek deadline før hver batch

## Sortiment (Indstillinger → Sortiment, `/admin/sortiment?tab=…`)
Erstatter de tidligere sider Kategorier, Produkttyper og Kategori-søgefiltre (gamle URL'er viderestiller). Faner i `sortiment/_tabs/`:
1. **Kategorier** (`categories` tabel) — kategorier/underkategorier + nøgleord til auto-kategorisering
2. **Varetyper** (`product_types`, tidl. "Produkttyper") — nøgleord, kategori og variant-egenskaber pr. type; egenskaber vælges fra den fælles liste (enhed er valgfri — uden enhed bruges de kun som forslag)
3. **Variant-egenskaber** (`variant_attributes`, migration 065) — fælles liste: navn, enhed, værdier i visningsrækkefølge med synonymer ("Marineblå = navy, marine"). `lib/variant-attributes.ts`: `classifyWord()` / `canonicalValue()`. Bruges af Saml ens varer (forslag, rullelister, synonymer oversættes), søgefiltre og shoppens variantvælger (rækkefølge: `getAttrOrder()` i `lib/shop/variant-order.ts` + `sortVariantsByAttributes()` / `compareAttrValues()` — egenskaber i listens rækkefølge, værdier i den definerede rækkefølge, ukendte værdier bagefter i naturlig orden, fx 8mm før 10mm)
4. **Søgefiltre** (`category_attribute_filters`) — hvilke egenskaber der er filtre pr. kategori i shoppen

## Import-flow i admin (menu → Import)
Rækkefølge og navne (trin-bjælke `_import-flow.tsx` øverst på hver side, samme som menuen i `_sidebar.tsx`):
1. **Leverandører** (`/admin/suppliers`) — import af varer/priser/lager
2. **Import-ændringer** (`/admin/changes`) — prisændringer, nye og udgåede varer fra seneste import
3. **Saml ens varer** (`/admin/matching`, tidl. "Produkt match") — forslag om samme vare hos flere leverandører; faner: Samme EAN / Lignende navn / Varianter
   - På hvert kort vælger admin **Samme vare** (ét produkt, flere leverandører) eller **Varianter** (ét produkt med varianter). Ved varianter angives egenskaber pr. vare i en tabel (forudfyldt fra `supplier_variant_attributes` eller forskellen i navnene, `inferVariantSetup()`). Gemmes som `create_as` + `member_attributes` på gruppen; `bulkCreateProductsFromGroups()` laver én variant pr. forskellig egenskabs-kombination (samme variant fra flere leverandører = én variant med flere leverandører, prioritet pr. variant)
4. **Nye varer** (`/admin/staging`, tidl. "Opret produkter") — varer uden match: opret, tilknyt eller afvis
   - Import-ændringer viser pr. prisændring også **Vores pris**: fulgte med / egen pris beholdt (knap "Brug X kr" → `POST /api/import-changes/[id]/apply`) / anden leverandør foretrukken / ingen salgspris. Samme varenummer flere gange i en leverandørfil behandles kun én gang (ellers skifter prisen frem og tilbage hver nat): `prepareImportItems()` (`lib/import-run.ts`, Engholm/Palby/Columbus) gemmer dubletterne med deres felter i `sync_state.duplicate_skus`, og Leverandører viser dem ("Vis og vælg"), hvor admin vælger hvilken linje der bruges — `sync_state.duplicate_choice` = { varenr: nummer i filens rækkefølge }, standard første
- **Automatik-log** (`/admin/auto-log`) — hvad pipelinen selv har gjort

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

### normalize_for_matching() (v2, migration 062)
SQL-funktion der renser navne inden fuzzy-sammenligning. Samme regler i `lib/matching-normalize.ts` (bruges af `/api/matching/auto-confirm`) — ret begge steder:
- Fjerner farver (inkl. bøjninger og mørke-/lyse-), retning/side (venstre/højre/bagbord/styrbord), størrelsesord (lille/stor/S–XXL), ny/original, emballage (stk/pk/pakke) og fyldord (og/med/til/for …)
- Ens tal: `2,5` → `2.5`, `10 mm` → `10mm`, `10 x 20` → `10x20`, `Ø10` → `10`; tegnsætning fjernes
- **Talværn** (`matching_numbers()` + `numbers_compatible()`): to navne kan kun matche, hvis tallene i det ene er en delmængde af tallene i det andet. `"Ankerkæde 10mm"` vs `"Ankerkæde 12mm"` matcher ikke (gav 0,74 i lighed før), `"Fender 15x58"` vs `"Lalizas 70123 Fender 15x58"` gør. I auto-confirm sendes EAN-grupper med modstridende tal til manuel gennemgang

## Env Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=          # Bruges af verifyCronRequest() — sæt også i Vercel dashboard
RESEND_API_KEY=       # Login-links, ordremails, påmindelser, "Gem kurv"
EMAIL_FROM=           # Valgfri. Afsender — standard "LoveSailing <no-reply@lovesailing.dk>" (domænet er verificeret i Resend)
SETTINGS_ENCRYPTION_KEY= # Valgfri. Krypterer app_settings (ellers afledt af SUPABASE_SERVICE_ROLE_KEY — skift = gemte nøgler skal indtastes igen)
GATEWAYAPI_TOKEN=     # Valgfri. SMS-login — sættes hellere på /admin/sms (GATEWAYAPI_REGION=eu for EU-konto, SMS_SENDER=afsendernavn)
NEXT_PUBLIC_SITE_URL= # Valgfri. Links i mails peger ellers på det domæne brugeren står på (fx kmb-nine.vercel.app)
```

## TODO — Udestående opgaver

### I gang / næste skridt
- [ ] **Kør matching** — åbn `/matching`, tryk "Kør matching", vurder grupperingskvalitet
- [ ] **Gennemgå match-grupper** — bekræft høj-konfidens grupper, opret draft-produkter
- [x] **Sync interval** — Kap-Horn sat til dagligt (migration 041)

### Fremtidige features
- [x] **Produktredigering** — `/products/[id]` inline-redigering (navn, beskrivelse, pris, billeder inkl. overtag leverandørbilleder, varianter, SEO)
- [x] **Checkout uden betaling** — `/checkout` → `POST /api/shop/orders` → `/checkout/bekraeftelse/[id]?t=` + admin `/admin/orders`
- [ ] **Betalingsudbyder** — Swedbank Pay bygget (`lib/shop/swedbankpay.ts` + `lib/shop/payment.ts`); afventer testadgang (Payee ID + access token) → testkøb → skift til produktion på `/admin/betaling`
- [x] **Handelsbetingelser-side** — `/handelsbetingelser` (forbrugeraftaleloven/købeloven: fortrydelse 14 dage inkl. standardformular og undtagelse for varer skåret i længde, reklamation 24 mdr., klage via Nævnenes Hus, persondata). Firmaoplysninger fra Butiksoplysninger; mangler CVR/adresse/e-mail, ser admin en advarsel på siden
- [x] **Kundelogin + levetid + påmindelser** — `/konto`, `/admin/lifecycle`, levetid på produkter
- [x] **Verificér lovesailing.dk i Resend** — afsender er `no-reply@lovesailing.dk` (`lib/shop/email.ts`)
- [x] **Salgsindsigt + AI-assistent** — `/admin/insights` og `/admin/ai` (se afsnit nedenfor)
- [x] **Egen AI-nøgle til butikken** — `/admin/ai-noegle` (kun ejere); krypteret i `app_settings`, fallback til `ANTHROPIC_API_KEY`
- [x] **Anthropic SDK 1.x** — `@anthropic-ai/sdk` 1.6 (API-version 2026-10-21: ingen `temperature`/`top_p`/`top_k`, nøglen sendes som `Authorization: Bearer`). AI-chat har server-side fallback ved afvisning
- [x] **SMS-udbyder** — GatewayAPI (`lib/shop/sms.ts`): token, konto (.com/.eu) og afsendernavn sættes af ejere på `/admin/sms` (krypteret i `app_settings` 'gatewayapi', fallback env `GATEWAYAPI_TOKEN`/`GATEWAYAPI_REGION`/`SMS_SENDER`), med test-SMS
- [x] **Import af gamle ordrer** — Ordrer → Importér gamle ordrer (`/admin/gamle-ordrer`): PDF med salgsbilag (én faktura pr. side, "Salgsbilag.pdf") læses i browseren med pdf.js (`pdfjs-dist/legacy/build/pdf.min.mjs` — den almindelige ESM-udgave fejler i Next' bundler; typer i `types/pdfjs-legacy.d.ts`). `lib/old-orders/invoice-parser.ts` (ren funktion, kolonner ud fra overskrifternes placering, fragtlinjer uden varenr., flersidede fakturaer, kontrol linjer+fragt = total). `lib/old-orders/import.ts`: varer kobles via EAN/varenr./leverandørens varenr.; mulige dubletter (samme total ±1 dag, fx den gamle webshops ordrer) vises ved siden af fakturaen med kunde, varer (navne slås op via produkt-id — den gamle webshops linjer har kun id/varenr./pris) og link, og `compareWithOrder()` vurderer samme handel (varer går igen eller samme kundenavn → fravalgt) / anden handel (anden kunde og ingen fælles varer → valgt) / uafklaret (fravalgt); ordrer gemmes som `source 'import'`, `order_number` = fakturanr. (kan ikke importeres to gange), betalt/afsluttet, `ordered_at` = bilagsdato, `customer_info.phone` fra Kundenr. hvis det er et telefonnummer (ellers ingen kobling til kundekonto). Fakturaerne har hverken e-mail eller telefon — kun Kundenr.
- [x] **Import af kassesalg (løssalg)** — samme side, "Kassesalg (CSV)": kassens journaludtræk (`Salg_Kronborg-*.txt`, semikolon, kan være delt i flere filer — kun første har overskriftslinjen; vælg alle på én gang). Læses i browseren (`lib/old-orders/pos-parser.ts`, ren funktion: én bon = DocNo, varelinjer + betalingslinjer, DocType 3 bon / 1 FAK / 2 KRE, returer = negativt antal). Udtrækket er ASCII — æøå er erstattet med mellemrum. `lib/old-orders/pos-import.ts`: `matchPosItems()` kobler kassens varenr. via leverandørens varenr. (uden foranstillede nuller / præfiks som `PM-`, foretrækker leverandøren der passer til varegruppen), EAN, vores/producentens varenr.; generiske knapper (TOVVÆRK, DIV, Skruer/Bolte A–O, gavekort) forbliver ukoblede. Gemmes som `source 'pos'`, `order_number` = `POS-<bonnr>` (idempotent), afsluttet/betalt, `ordered_at` = bonens tid (dansk tid → UTC), betalingsmåder i `payment_provider`, ingen lager/mails. Kundenr. der ligner et telefonnummer → `customer_info.phone` (knyttes ved SMS-login). Analysen viser ukoblede varer, der ligger i Nye varer (`findStagedPosItems()`, `supplier_product_staging.normalized_sku`). Genimport med "Opdatér koblinger" (`importPosReceipts(…, update)`) opdaterer varelinjerne på eksisterende bonner (uden `access_token`, så id/kvitteringslink/kundekobling bevares). Kassesalg skjules i `/admin/orders` (vis med `?kilde=pos`), i dashboardets ordretal og i dublet-tjekket for PDF-fakturaer
- [x] **Lagertræk ved salg (webshop)** — reservation ved ordre, træk ved afhentning, frigivelse ved annullering (`order_stock_apply`, migration 057). POS afventer admind
- [x] **Eget lager justering** — lageroptælling med årsagskode og log (`/admin/inventory`). POS-webhook afventer admind
- [x] **Staging batch-behandling** — opret/afvis mange ad gangen (`/admin/staging`)
- [ ] **admind POS integration** — venter på API docs
- [x] **Indkøbsliste pr. leverandør** — `/admin/purchasing` (+ CSV pr. leverandør via `/api/purchasing/export`). Logik i `lib/purchasing.ts`: foretrukken (priority 1) → ellers billigst for det der skal bestilles (pris × max(antal, minimumsordre)); udgåede springes over; varianter i variantfamilier finder leverandør via det oprindelige produkt med samme EAN. "Markér som bestilt" pr. leverandør skriver `line_items[].ordered` (ref, antal, leverandør, tid, admin) på ordrelinjerne — trækkes fra det manglende antal; kan fortrydes. Opdateringer sker kun hvis ordren ikke er ændret siden læsning (optimistisk lås på `orders.updated_at`). **Pr. ordre** (`?visning=ordrer`): samme varer fordelt på ordrer med kunde, leveringsform og adresse — til bestilling med levering direkte til kunden via leverandørens B2B-portal; "Markér ordre som bestilt" pr. ordre (`markSupplierOrdered(supplier, by, orderId)`). Ordrenumre linker til `/admin/orders?q=<ordrenr>`. Bestillinger sker manuelt i leverandørernes B2B-portaler
- [ ] **Automatiske bestillinger pr. leverandør** — opsætning pr. leverandør (fx hver aften) der samler indkøbslisten og sender den. **Afklares først:** hvordan hver leverandør modtager bestillinger (e-mail, CSV/Excel, portal, EDI/API), tidsfrist, minimumsordre/fragtfri grænse, og om varer bestilt markeres så de ikke bestilles igen
- [x] **Fuzzy match udvidelse** — flere fyldord/farver/størrelser, ens talformat og talværn (migration 062, `lib/matching-normalize.ts`)

## Checkout-flow
- Kurv ligger i `localStorage` (`ls_cart`); linje-id er `produktId` eller `produktId__variantId`
- `POST /api/shop/orders` genberegner pris (variant `sales_price` ?? produkt `sales_price`) og fragt (`lib/shop/shipping.ts`) — stol aldrig på klientens pris. 409 = priser ændret / vare utilgængelig (klienten retter kurven), 503 = databasefejl
- Betaling: `online` = **Swedbank Pay** (Checkout v3.1, redirect; kort/MobilePay) eller `pickup` = betal ved afhentning. Opsætning på `/admin/betaling` (kun ejere; token + Payee ID krypteret i `app_settings` 'swedbankpay', fallback env `SWEDBANK_PAY_TOKEN`/`SWEDBANK_PAY_PAYEE_ID`/`SWEDBANK_PAY_ENV`). **Testmiljø: online betaling vises kun for admins** (`onlinePaymentAvailable(forAdmin)`), produktion: for alle
  - Flow: ordre oprettes → `startPayment()` (POST /psp/paymentorders, `payment_reference` = paymentOrder-id) → Swedbanks betalingsside → `completeUrl`/`cancelUrl` = `/checkout/betaling/[id]?t=` → `syncPayment()` (GET ?$expand=paid) → `payment_status` unpaid → **authorized** (reserveret) / paid (Sale) / failed / cancelled. Kortets maskedPan gemmes via `rememberCard(source 'online')`. Ordrebekræftelse sendes først ved reservation (`lib/shop/order-email.ts`). Callback `POST /api/shop/payments/swedbank` stoler ikke på indholdet — slår op og kalder `syncPayment()`
  - **Træk ved levering:** admin "Sendt til kunden" / "Afhentet" / status Afsluttet → `captureOrderPayment()` (capture-operationen); Annulleret → `cancelOrderPayment()`. Fejler Swedbank, ændres ordrens status ikke (fejlen vises øverst). Hændelser logges i `payment_events` (migration 070)
- Betal ved afhentning kræver login + kendt kunde (`payAtPickupEligible`: afsluttet eller gammel/importeret ordre, eller admin-overstyring i `/admin/customers`) + afhentning i butik — tjekkes på serveren
- Uden online betaling kan ukendte kunder ikke bestille (knappen er låst)
- Afhentningsflow i `/admin/orders`: Ny → Klar til afhentning (mail til kunden, én gang) → Afhentet og betalt
- **Kortreference** (`lib/payment-refs.ts`, migration 068): ved "Afhentet og betalt" kan kortets sidste 4 cifre (fra terminalens kvittering) indtastes → `orders.payment_card` + `customer_payment_refs`. Kunder → "Find kunde via kort" (sidste 4, evt. første 6) viser "Er det en af disse?". Hele kortnummeret gemmes/accepteres aldrig (`parseCardInput()` afviser det). `rememberCard()`/`fromMaskedPan()` er klar til admind POS og Swedbank Pay (maskedPan)
- Lager: ny ordre reserverer min(antal, ledigt) pr. linje (`line_items[].reserved_qty`); resten skal bestilles hos leverandør (vises i admin). Afsluttet → træk fra beholdning, annulleret → frigiv, genåbnet → reservér igen. Én transaktion pr. ordre med rækkelåse, idempotent via `orders.stock_state`
- Butiksoplysninger (navn, CVR, adresse, kontakt, åbningstider, leveringstid, returfragt): `getStore()` / `getStoreSettings()` i `lib/shop/store.ts` (tabel `store_settings`, redigeres på `/admin/butik`, falder tilbage til standardværdier). Bruges af handelsbetingelser, sidefoden (`app/(shop)/_footer.tsx`), kvittering og ordremails
- Kvittering kræver `orders.access_token` i URL (kunden er ikke logget ind)
- E-mails via Resend (`lib/shop/email.ts`) — sendes kun hvis `RESEND_API_KEY` er sat
- **Admin-login:** `/login` → e-mail → magic link `/login/bekraeft?token=` → knap → cookie `kmb_admin` (session i `admin_sessions`, 14 dage). Ejere opretter/deaktiverer admins på `/admin/admins`. Kan mailen ikke sendes, logges linket i serverloggen (Vercel) som nødadgang
- **`middleware.ts` (Node.js-runtime) kræver admin-session på alt under `/api`**, undtagen `/api/shop/*`, `/api/cron/*` (egen Bearer), `/api/auth/login`, `/api/health` og `GET /api/products?shop=1`. Nye offentlige ruter skal lægges under `/api/shop/`
- Server actions går ikke gennem middleware — kald selv `isAdmin()` (`lib/admin-auth.ts`)
- **Redigering fra shoppen:** er man logget ind som admin, viser produktsiden (`/produkt/[id]`) en "✏️ Rediger produkt"-knap → panel (`_admin-edit.tsx`) med navn, brand, pris, status, kategorier (første = primær; forslag hentes først når panelet åbnes, via `GET /api/products/category-options`) og beskrivelser. Gemmer kun ændrede felter via `PATCH /api/products/[id]`
- **Forsiden → bådtype → kategori:** forsiden viser Sejlbåd / Motorbåd (`/sejlbaad`, `/motorbaad`, `app/(shop)/_boat-categories.tsx`). Hver viser kategorierne, hvis `categories.boat_types` indeholder bådtypen (styres i Sortiment → Kategorier; tom = begge), sorteret efter `sort_order`. Kategorilinks får `?baad=`: brødkrumme via bådtypen, og produkter hvis `products.boat_type` kun er den anden bådtype skjules (`/api/products?boat_type=`). `lib/shop/boat-types.ts`
- **Min båd-profil:** vælger en besøgende Sejlbåd/Motorbåd, huskes det i browseren (`localStorage` `ls_boat_profile`, `inferred: true` — `lib/shop/boat-storage.ts`). Bådtypesiden og kurven viser `BoatPrompt` (`app/(shop)/_boat-prompt.tsx`): "Har du en sejlbåd? Giv den navn og længde" — kun e-mail kræves. Ikke logget ind → login-link med `purpose: 'boat'` og `next=/min-baad?gem=1`; efter klik gemmer Min båd båden på kontoen (`PUT /api/shop/boat`, tabel `shop_user_boats`, migration 069). Logget ind → gemmes direkte. Skjules når båden er gemt, linket er sendt, eller "Ikke nu" (30 dage)
- **Shop-hastighed:** produktsiden henter produkt, varianter og admin-tjek samtidig (`cache()` deler opslaget med metadata) og streamer "Flere i …" ind bagefter; `loading.tsx` på produkt- og kategorisider. Kategorier slås op via `getCategoryCounts()` (`lib/shop/categories.ts`, RPC fra migration 063 med fallback) — hent aldrig alle produkters kategorier til appen (Supabase giver kun 1000 rækker pr. kald). Kategorisiden kalder `/api/products`-handleren direkte i stedet for over HTTP

## Kundekonto & levetid
- Login uden adgangskode: `/konto` → `POST /api/shop/auth/request` (e-mail eller telefon) → mail med `/konto/login?token=` → knap → server action `verifyLogin` → cookie `ls_session`
- Linket kræver et klik på siden (mail-scannere må ikke bruge engangstokenet). Tokens 30 min, maks 5 pr. time pr. kunde
- Telefon-login: SMS via GatewayAPI (`POST https://gatewayapi.{com|eu}/rest/mtsms`, `Authorization: Token …`). Token gemmes før afsendelse; fejler SMS'en eller er GatewayAPI ikke sat op, sendes linket til kundens e-mail (og tokenets kanal sættes til 'email', så kun den bekræftede kanal knytter ordrer)
- Ved login knyttes gamle ordrer til kunden via `link_orders_to_shop_user()` — kun via den kanal kunden har bekræftet
- Importerede ordrer: sæt `ordered_at` (købsdato), `email` og/eller `customer_info.phone`, `line_items[].product_id` = vores produkt-UUID
- Levetid: `products.expected_lifespan_months` (+ `lifespan_note`). Forfald = `ordered_at` + levetid (view `customer_product_lifecycle`)
- `/admin/lifecycle` sender påmindelser (kun samtykke + e-mail, én gang pr. kunde/ordre/produkt). Afmelding via `/afmeld?t=`

## Salgsanalyse & AI-assistent
- Prishistorik logges automatisk af triggere (`price_history`, migration 058) — grundlag for prisfølsomhed
- `sales_lines` (view) folder alle ordrelinjer ud; annullerede/refunderede udelades; varianter under et overprodukt tælles som overproduktet (`family_id`)
- `lib/ai/analytics.ts`: wrappers om `analytics_*()` + simuleringer (`simulatePriceChange`, `simulateBundle` → ren `bundleScenarios`). Elasticitet estimeres med log-log-regression og bruges kun hvis pålidelig (≥4 mdr., ≥5 % prisvariation), ellers antagelse -1,2 — antagelserne returneres altid
- `lib/ai/tools.ts`: værktøjer til modellen (kun læsning/beregning) med egen inputvalidering (input streames og valideres ikke af API'et)
- `POST /api/ai/chat`: manuel værktøjsløkke med streaming (SSE) via `client.beta.messages.stream`, model `claude-opus-5-5`, effort `high`, `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01` — afviser Opus, kører API'et selv svaret på en anden model; før sidste `fallback`-blok gemmes kun tekst, `echoContent()`), cache på systemprompt og historik. Samtaler gemmes i `ai_messages` som rå content-blokke (append-only — thinking-blokke skal sendes uændret tilbage). Dato sendes i brugerens tur, ikke i systemprompten (cache)
- Nøgle: `anthropicClient()` (`lib/ai/key.ts`) — butikkens egen nøgle fra `/admin/ai-noegle` (AES-256-GCM via `lib/secrets.ts`, testes mod Anthropic før den gemmes), ellers `ANTHROPIC_API_KEY`. Bruges af AI-chat og produkttype-/kategoriforslag
- Viden: systemprompt = grundinstruks + branchekendskab (`lib/ai/knowledge.ts`, i koden) + butikkens egen viden (`ai_knowledge.id='shop'`, redigeres på `/admin/ai-viden`). Cache-breakpoint på sidste blok — cachen brydes kun når butikkens viden ændres

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
