import type { Metadata } from 'next'
import Link from 'next/link'
import { getStoreSettings, missingStoreFields } from '@/lib/shop/store'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { FREE_SHIPPING_THRESHOLD, DELIVERY_COST } from '@/lib/shop/shipping'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Handelsbetingelser' }

// Handelsbetingelser for LoveSailing.dk. Firmaoplysninger, leveringstid og returfragt redigeres i admin
// (Indstillinger → Butiksoplysninger). Teksten følger forbrugeraftaleloven og købeloven.

const kr = (n: number) => `${n.toLocaleString('da-DK')} kr`

export default async function TermsPage() {
  const [{ store, updatedAt }, admin] = await Promise.all([getStoreSettings(), getCurrentAdmin()])
  const missing = missingStoreFields(store)
  const company = store.legalName ?? store.name
  const contact = [store.email && <a key="e" href={`mailto:${store.email}`}>{store.email}</a>, store.phone && <span key="p">tlf. {store.phone}</span>].filter(Boolean)
  const contactLine = contact.length > 0
    ? <>{contact.reduce<React.ReactNode[]>((acc, c, i) => (i ? [...acc, ' eller ', c] : [c]), [])}</>
    : <>os</>

  return (
    <article className="ls-legal">
      {admin && missing.length > 0 && (
        <p className="ls-legal-admin">
          Kun synligt for admin: handelsbetingelserne mangler <strong>{missing.join(', ')}</strong>.{' '}
          <Link href="/admin/butik">Udfyld under Butiksoplysninger →</Link>
        </p>
      )}

      <h1>Handelsbetingelser</h1>
      <p className="ls-legal-lead">
        Betingelserne gælder for køb på LoveSailing.dk. Handler du som privatperson, har du altid mindst de rettigheder,
        der følger af forbrugeraftaleloven og købeloven.
      </p>

      <h2>1. Hvem handler du med</h2>
      <p>
        {company}{store.legalName && store.legalName !== store.name && <> (driver {store.name})</>}
        {store.address && <><br />{store.address}</>}
        {store.cvr && <><br />CVR-nr. {store.cvr}</>}
        {store.email && <><br />E-mail: <a href={`mailto:${store.email}`}>{store.email}</a></>}
        {store.phone && <><br />Telefon: {store.phone}</>}
        {store.openingHours && <><br />Åbningstider i butikken: {store.openingHours}</>}
      </p>

      <h2>2. Priser</h2>
      <p>
        Alle priser er i danske kroner og inkl. 25 % moms. Fragt fremgår tydeligt i kurven og i kassen, før du bestiller.
        Vi tager forbehold for trykfejl, åbenlyse prisfejl og udsolgte varer — opstår det, kontakter vi dig, og du kan vælge at annullere uden omkostninger.
      </p>

      <h2>3. Bestilling og aftale</h2>
      <p>
        Når du har bestilt, modtager du en ordrebekræftelse på e-mail med et overblik over varer, priser og levering.
        Aftalen er bindende, når du har modtaget ordrebekræftelsen. Gem den — den er din dokumentation for købet.
        Ordren arkiveres hos os, og du kan se den på din konto, hvis du er logget ind.
      </p>

      <h2>4. Betaling</h2>
      <p>
        De mulige betalingsformer vises i kassen. Vælger du <strong>betal ved afhentning</strong>, betaler du i butikken,
        når du henter varerne. Ved online betaling trækkes beløbet først, når varerne afsendes eller udleveres.
      </p>

      <h2>5. Levering og afhentning</h2>
      <p>
        Vi leverer i Danmark (ekskl. Færøerne og Grønland). Levering med pakke koster {kr(DELIVERY_COST)} og er gratis ved køb for mindst {kr(FREE_SHIPPING_THRESHOLD)}.
        {store.deliveryTime && <> Varer på lager sendes normalt inden for {store.deliveryTime}.</>}
        {' '}Skal en vare bestilles hjem fra vores leverandør, oplyser vi den forventede leveringstid.
      </p>
      <p>
        Vælger du <strong>afhentning i butikken</strong>, er det gratis. Vi sender en e-mail, når varerne er klar
        {store.address ? <> til afhentning på {store.address}</> : null}.
      </p>
      <p>
        Kontrollér varerne, når du modtager dem. Er en pakke synligt beskadiget, så bed om, at skaden noteres ved udleveringen, og kontakt os hurtigst muligt.
      </p>

      <h2>6. Fortrydelsesret — 14 dage</h2>
      <p>
        Som forbruger har du 14 dages fortrydelsesret. Fristen løber fra den dag, du (eller en du har udpeget) modtager varen.
        Består ordren af flere varer, der leveres hver for sig, løber fristen fra den dag, du modtager den sidste vare.
      </p>
      <p>
        <strong>Sådan fortryder du:</strong> giv os en utvetydig besked inden fristen udløber — skriv til {contactLine}.
        Du kan bruge standardfortrydelsesformularen nedenfor, men det er ikke et krav. Herefter skal du sende eller aflevere varen
        til os senest 14 dage efter, at du har meddelt, at du fortryder.
      </p>
      <p>
        {store.returnShipping === 'shop'
          ? <>Vi betaler returfragten. </>
          : <>Du betaler selv for at returnere varen. </>}
        Varen skal sendes forsvarligt emballeret, og vi anbefaler, at du gemmer kvitteringen for forsendelsen.
      </p>
      <p>
        <strong>Varens stand:</strong> du må undersøge varen, som du ville gøre i en butik — men ikke tage den i brug.
        Er varen brugt mere end nødvendigt for at fastslå dens art, egenskaber og funktion, kan vi fratrække værditabet i det beløb, du får tilbage.
      </p>
      <p>
        <strong>Tilbagebetaling:</strong> vi tilbagebetaler købsprisen og den oprindelige standardfragt senest 14 dage efter, at vi har modtaget din besked om fortrydelse.
        Vi bruger samme betalingsmiddel, som du betalte med, medmindre andet aftales. Vi kan vente med tilbagebetalingen, til vi har modtaget varen,
        eller til du har dokumenteret, at den er sendt retur.
      </p>
      <p>
        <strong>Undtagelser:</strong> fortrydelsesretten gælder ikke varer, der er fremstillet efter dine specifikationer eller tydeligt tilpasset dig
        — fx tovværk, kæde, wire eller slanger skåret i en længde efter dit ønske — og heller ikke forseglede varer, hvor forseglingen er brudt
        og varen af sundheds- eller hygiejnehensyn ikke kan returneres.
      </p>

      <h2>7. Reklamationsret — 24 måneder</h2>
      <p>
        Som forbruger har du 24 måneders reklamationsret efter købeloven. Det betyder, at du kan få en fejl, der var der ved leveringen,
        repareret, varen ombyttet, få pengene tilbage eller et afslag i prisen — afhængigt af situationen.
        Viser fejlen sig inden for det første år, går vi ud fra, at den var der ved leveringen, medmindre andet kan påvises.
        Reklamationsretten dækker ikke almindelig slitage eller fejl, der skyldes forkert brug, montering eller vedligehold.
      </p>
      <p>
        Kontakt {contactLine} inden rimelig tid efter, at du har opdaget fejlen — reklamerer du inden for 2 måneder, er det altid rettidigt.
        Beskriv fejlen og vedlæg gerne billeder. Er reklamationen berettiget, dækker vi rimelige omkostninger til returfragt.
      </p>
      <p>
        Køber du som erhvervsdrivende, gælder købelovens regler om handelskøb. Fortrydelsesretten gælder kun forbrugere.
      </p>

      <h2>8. Klage</h2>
      <p>
        Er du utilfreds, så kontakt os først — så finder vi som regel en løsning. Lykkes det ikke, kan du som forbruger klage til
        Nævnenes Hus, Toldboden 2, 8800 Viborg, via <a href="https://www.naevneneshus.dk" target="_blank" rel="noopener noreferrer">naevneneshus.dk</a>.
      </p>

      <h2>9. Persondata</h2>
      <p>
        Vi bruger dine oplysninger (navn, adresse, e-mail, telefon og ordrer) til at behandle din ordre, levere varerne og give dig service.
        Har du sagt ja til nyheder eller vedligeholdspåmindelser, bruger vi også din e-mail til det — du kan til enhver tid afmelde dig via linket i mailen.
        Betaler du med kort, gemmer vi kun kortets sidste 4 cifre (og evt. de første 6, der viser kortudstederen) — aldrig hele
        kortnummeret — så vi kan genkende dig som kunde i butikken og på webshoppen.
        Ordrer gemmes i 5 år af hensyn til bogføringsloven. Vi sælger aldrig dine oplysninger. De deles kun med dem, der hjælper os med at drive shoppen
        (fx hosting, e-mail og fragtfirma), og kun i det omfang, det er nødvendigt.
      </p>
      <p>
        Du har ret til at få indsigt i, rettet og slettet dine oplysninger. Skriv til {contactLine}. Du kan klage til
        Datatilsynet (<a href="https://www.datatilsynet.dk" target="_blank" rel="noopener noreferrer">datatilsynet.dk</a>).
      </p>

      <h2>Standardfortrydelsesformular</h2>
      <div className="ls-legal-form">
        <p>(Udfyld og returnér kun formularen, hvis du ønsker at gøre fortrydelsesretten gældende)</p>
        <p>
          Til: {company}{store.address && <>, {store.address}</>}{store.email && <>, {store.email}</>}
        </p>
        <p>Jeg meddeler herved, at jeg ønsker at gøre min fortrydelsesret gældende i forbindelse med min aftale om køb af følgende varer:</p>
        <p>Bestilt den / modtaget den: ________________</p>
        <p>Ordrenummer: ________________</p>
        <p>Forbrugerens navn og adresse: ________________</p>
        <p>Dato og underskrift (kun hvis formularen sendes på papir): ________________</p>
      </div>

      {updatedAt && (
        <p className="ls-legal-updated">Senest opdateret {new Date(updatedAt).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      )}
    </article>
  )
}
