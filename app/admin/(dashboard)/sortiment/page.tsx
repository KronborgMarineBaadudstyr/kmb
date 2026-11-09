import Link from 'next/link'
import CategoriesTab from './_tabs/categories'
import ProductTypesTab from './_tabs/product-types'
import VariantAttributesTab from './_tabs/variant-attributes'
import SearchFiltersTab from './_tabs/search-filters'

export const metadata = { title: 'Sortiment' }

// Ét sted for sortimentets opbygning. Fanerne følger sammenhængen:
// Kategori → Varetype (fx Fender, hører til en kategori) → Variant-egenskaber (fx Størrelse, Farve) → Søgefiltre i shoppen
const TABS = [
  { key: 'kategorier',  label: 'Kategorier',         hint: 'Kategorier og underkategorier i shoppen + nøgleord der placerer varer automatisk' },
  { key: 'varetyper',   label: 'Varetyper',          hint: 'Hvad varen er (fx Fender, Ankerkæde): nøgleord, kategori og hvilke egenskaber varianterne har' },
  { key: 'egenskaber',  label: 'Variant-egenskaber', hint: 'Fælles liste over hvad der adskiller varianter (Størrelse, Farve …) med værdier, synonymer og rækkefølge' },
  { key: 'soegefiltre', label: 'Søgefiltre',         hint: 'Hvilke egenskaber kunden kan filtrere på i hver kategori' },
] as const

type TabKey = typeof TABS[number]['key']

export default async function SortimentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const active: TabKey = TABS.some(t => t.key === tab) ? tab as TabKey : 'kategorier'
  const current = TABS.find(t => t.key === active)!

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-6 pt-5">
        <h1 className="text-2xl font-bold text-gray-900">Sortiment</h1>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">
          Hvordan varerne er bygget op: <strong className="font-medium text-gray-700">Kategori</strong> → <strong className="font-medium text-gray-700">Varetype</strong> (fx Fender)
          → <strong className="font-medium text-gray-700">Variant-egenskaber</strong> (fx Størrelse, Farve) → <strong className="font-medium text-gray-700">Søgefiltre</strong> i shoppen.
        </p>
        <nav className="flex gap-1 overflow-x-auto -mb-px" aria-label="Sortiment">
          {TABS.map((t, i) => (
            <Link key={t.key} href={`/admin/sortiment?tab=${t.key}`} aria-current={t.key === active ? 'page' : undefined}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 ${
                t.key === active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <span className="text-gray-400 mr-1.5">{i + 1}</span>{t.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="px-6 pt-4 text-sm text-gray-500">{current.hint}</p>
      {active === 'kategorier'  && <CategoriesTab />}
      {active === 'varetyper'   && <ProductTypesTab />}
      {active === 'egenskaber'  && <VariantAttributesTab />}
      {active === 'soegefiltre' && <SearchFiltersTab />}
    </div>
  )
}
