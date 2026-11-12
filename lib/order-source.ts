// Hvor en ordre kommer fra — vises som mærkat i admin
export const ORDER_SOURCE_LABEL: Record<string, string> = {
  webshop:     'Webshop',
  old_webshop: 'Gammel webshop',
  import:      'Faktura',
  pos:         'Kasse',
}
export const orderSourceLabel = (s: string) => ORDER_SOURCE_LABEL[s] ?? s
