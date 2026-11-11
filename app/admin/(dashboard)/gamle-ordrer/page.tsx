import { OldOrdersImporter } from './_importer'

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
      <OldOrdersImporter />
    </div>
  )
}
