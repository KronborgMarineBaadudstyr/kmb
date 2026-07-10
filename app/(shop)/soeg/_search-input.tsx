'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function SearchInput({ initialQ }: { initialQ: string }) {
  const [q, setQ] = useState(initialQ)
  const router = useRouter()
  const [, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    startTransition(() => {
      router.push(term.length >= 2 ? `/soeg?q=${encodeURIComponent(term)}` : '/soeg')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="ls-search-input-wrap">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        autoFocus
        placeholder="Søg vare, brand eller varenummer…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
    </form>
  )
}
