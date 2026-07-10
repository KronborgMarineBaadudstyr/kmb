'use client'

import { useRouter, usePathname } from 'next/navigation'

export function SortSelect({ current, slug }: { current: string; slug: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`${pathname}?sort=${e.target.value}&page=1`)
  }

  return (
    <select
      className="ls-sort-select"
      value={current}
      onChange={handleChange}
    >
      <option value="name_asc">Navn A–Å</option>
      <option value="name_desc">Navn Å–A</option>
      <option value="price_asc">Pris lav–høj</option>
      <option value="price_desc">Pris høj–lav</option>
    </select>
  )
}
