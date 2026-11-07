// Butikkens oplysninger til afhentning — bruges på kvittering og i mails.
// Adresse og åbningstider vises kun hvis de er udfyldt.

export const STORE = {
  name:         'Kronborg Marine Bådudstyr',
  address:      null as string | null,   // fx 'Havnevej 1, 3000 Helsingør'
  openingHours: null as string | null,   // fx 'Man–fre 9–17, lør 9–13'
}

export function pickupPlaceHtml(): string {
  return [STORE.name, STORE.address, STORE.openingHours].filter(Boolean).join('<br>')
}
