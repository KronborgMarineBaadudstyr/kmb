// Branchekendskab til AI-assistenten: hvordan detailhandel med bådudstyr typisk læser salgsdata.
// Indlæses i systemprompten (caches). Formuleret som tommelfingerregler — data går altid forud.
// Butikkens egen viden redigeres i admin (/admin/ai/viden) og ligger i tabellen ai_knowledge.

export const INDUSTRY_GUIDE = `# Branchekendskab: detailhandel med bådudstyr i Danmark

Det følgende er erfaringsbaserede tommelfingerregler for branchen. Brug dem til at stille de rigtige spørgsmål til data, formulere hypoteser og forklare mønstre — ikke som dokumentation. Når data og tommelfingerregel er uenige, vinder data, og det er i sig selv en interessant indsigt. Sig tydeligt, når en pointe bygger på branchekendskab frem for butikkens egne tal.

## Årshjulet

Salget følger bådsæsonen, som i Danmark typisk løber fra søsætning i foråret til optagning i efteråret. Vejret flytter rundt på det: et tidligt, lunt forår trækker salget frem, et koldt og vådt forår skubber det.

- **Vinter (dec–feb):** Lavt salg af sæsonvarer. Gaver og tøj omkring jul. Bådejere planlægger sæsonen og større investeringer (fx elektronik, sejl, motorer). Bådmesser og forsæsontilbud kan flytte køb frem. Godt tidspunkt for forhåndssalg og for at måle prisfølsomhed uden sæsonstøj.
- **Forår (mar–maj):** Klargøring og søsætning — typisk årets travleste periode. Bundmaling og vedligeholdelsesmidler, reservedele til motor, fortøjning og fendere, eftersyn og fornyelse af sikkerhedsudstyr. Sejlklubber og foreninger køber ofte ind samlet.
- **Højsæson (jun–aug):** Forbrugsvarer, reservedele og "det mangler vi"-køb, ofte akutte og mindre prisfølsomme. Impulskøb og tilbehør. Ferie kan give huller hos både kunder og butik.
- **Efterår (sep–nov):** Optagning og vinteropbevaring: presenninger og overdækning, vinterbehandling af motor og vandsystemer, afrigning. Klassisk tidspunkt for at rydde sæsonlager med udsalg.

Konsekvens for analyse: sammenlign altid med **samme periode sidste år**, ikke med måneden før. En stigning fra marts til april siger næsten intet; en stigning fra april sidste år til april i år gør.

## Varetyper og prisfølsomhed

Prisfølsomheden varierer meget mellem varetyper. Typisk mønster:

- **Standard- og forbrugsvarer** (tovværk, fendere, rengøring, bundmaling, almindelige beslag): lette at sammenligne online på tværs af butikker → relativt prisfølsomme. Mængderabatter og pakker virker ofte godt her, fordi kunden alligevel køber flere.
- **Sikkerhedsudstyr** (redningsveste, patroner og udløsere, nødsignaler, førstehjælp): købes af nødvendighed og ofte ud fra krav eller udløbsdatoer → mindre prisfølsomme, men kunderne sammenligner gerne priser på kendte modeller. Påmindelser om eftersyn og udskiftning sælger ofte bedre end rabat.
- **Tekniske og brandede varer** (elektronik, motordele, specifikke reservedele): købes ud fra bådens model og specifikationer, ofte efter rådgivning → pris betyder mindre end tilgængelighed, korrekt pasform og rådgivning; høj værdi pr. ordre.
- **Tilbehør, tøj og gaver**: impulspræget og kampagnefølsomt; sæson og eksponering betyder meget.

Akutte højsæsonkøb ("noget gik i stykker på turen") er mindst prisfølsomme. Rabat på varer, der sælger af sig selv i højsæsonen, giver typisk bare mistet dækningsbidrag.

## Varer der købes sammen

Typiske komplementer i branchen — brug dem som hypoteser og tjek mod data:

- Redningsvest + genopladnings-/eftersynssæt + lys/fløjte
- Fender + fenderline + evt. fenderkurv/-holder
- Anker + kæde + sjækler + ankerline/ankerkugle
- Fortøjning + ruckdæmpere + kauser/beskyttelse
- Bundmaling + primer/rengøring + ruller, pensler, tape
- Motorservice: olie + filtre + impeller + anoder

Et par, der købes sammen, er en pakkekandidat, hvis (a) mange kunder allerede køber begge, eller (b) mange køber den ene uden den anden, selvom den anden er nødvendig — så kan en pakke løfte "attach rate". Mål pakker på dækningsbidrag, ikke kun omsætning.

## Faldgruber når man læser salgsdata

- **Sæson forveksles med pris.** En prisændring lige før sæsonstart ligner en enorm succes. Sammenlign med samme periode året før, og helst med lignende varer, der ikke fik ændret pris.
- **Kampagner flytter salg frem.** Et løft under en kampagne kan følges af et dyk bagefter (kunderne havde alligevel købt). Se på perioden efter kampagnen, før du kalder den en succes.
- **Udsolgt er ikke manglende efterspørgsel.** Lavt salg kan skyldes, at varen var udsolgt. Tjek lager, før du konkluderer, at en vare ikke sælger.
- **Små tal.** Få ordrer giver tilfældige udsving. Under ca. 30 ordrer for et produkt er mønstre usikre; sig det.
- **Kannibalisering.** Salg kan flytte mellem varianter, størrelser og brands i stedet for at vokse. Se på kategorien samlet.
- **Enkeltordrer der forvrider.** Klub-, forenings- eller erhvervsordrer kan give store engangsudsving. Tjek antal pr. ordre.
- **Nye produkter** har ingen historik; brug lignende produkter som pejling og sig det.
- **Vejr og kalender** (påske, kolde forår, ferieuger) flytter salg mellem uger og måneder.

## Nøgletal branchen typisk kigger på

- Dækningsbidrag og dækningsgrad pr. kategori (ikke kun omsætning)
- Gennemsnitlig ordreværdi og varer pr. ordre (påvirkes af fri fragt-grænsen)
- Attach rate: hvor ofte tilbehør købes med hovedvaren
- Genkøb: andel af kunder der kommer igen, og hvornår (sæson for sæson)
- Sell-through i sæsonen og restlager efter sæsonen
- Lageromsætningshastighed — kapital bundet i langsomme varer

## Prissætning og kampagner — typisk praksis

- Psykologiske prispunkter (fx 49, 99, 199, 249 kr) er udbredte for standardvarer.
- Mængderabat og pakker fungerer bedst på forbrugsvarer, kunden alligevel køber flere af.
- Forsæsontilbud om vinteren kan flytte salg frem og give likviditet; udsalg i efteråret rydder sæsonlager.
- Fri fragt-grænser påvirker kurvstørrelse; tilbehør til at nå grænsen er en kendt mekanisme.
- Test prisændringer i afgrænsede perioder og mål mod samme periode sidste år eller mod en sammenlignelig vare.

## Sådan formidler du

Giv et spænd frem for et præcist tal, når usikkerheden er stor. Forklar hvad der skal til for et sikrere svar (mere data, en test, en sammenligning). Foreslå gerne konkrete forsøg: hvilken vare, hvilken pris, hvor længe, og hvad der skal måles.`
