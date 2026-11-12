import { OldOrdersImporter } from './_importer'
import { PosImporter } from './_pos-importer'

export const dynamic = 'force-dynamic'

export default function OldOrdersPage() {
  return (
    <div className="p-8 max-w-6xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Importér gamle ordrer</h2>
        <p className="text-sm text-gray-500 max-w-3xl">
          Upload PDF'en med salgsbilag (én faktura pr. side). Den læses her i browseren — du ser alle ordrer, før noget importeres.
          Varer kobles til jeres produkter via varenummer/EAN, og kunderne knyttes til deres konto, når de logger ind med det
          telefonnummer, der står som Kundenr. Samme faktura kan ikke importeres to gange.
        </p>
      </div>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Fakturaer (PDF)</h3>
        <OldOrdersImporter />
      </section>
      <section className="space-y-3 pt-6 border-t border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Kassesalg (CSV)</h3>
          <p className="text-sm text-gray-500 max-w-3xl">
            Udtræk af kassens salg (løssalg uden kunde). Bruges til salgsanalysen og AI-assistenten: hvad købes sammen,
            sæsonudsving og prisfølsomhed. Filen læses her i browseren; varer kobles via leverandørens varenummer eller EAN.
            Bonner med et telefonnummer som kundenummer knyttes til kunden, når de logger ind med det nummer.
            Kassesalg vises ikke i ordrelisten som standard (se Ordrer → Vis kassesalg).
          </p>
        </div>
        <PosImporter />
      </section>
    </div>
  )
}
