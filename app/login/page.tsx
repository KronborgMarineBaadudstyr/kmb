'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const NOTICES: Record<string, string> = {
  udloebet: 'Login-linket er udløbet eller allerede brugt. Bed om et nyt.',
  ugyldig:  'Login-linket er ugyldigt. Bed om et nyt.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState(NOTICES[searchParams.get('login') ?? ''] ?? '')
  const [message, setMessage] = useState('')
  const [devLink, setDevLink] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, next: searchParams.get('from') ?? undefined }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Noget gik galt')
      else { setMessage(json.message); setDevLink(json.dev_link ?? '') }
    } catch {
      setError('Netværksfejl — prøv igen')
    }
    setLoading(false)
  }

  if (message) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-gray-900">Tjek din indbakke</p>
        <p className="text-gray-600">{message}</p>
        {devLink && (
          <p className="text-xs text-gray-500">Udvikling (ingen e-mail sat op): <a href={devLink} className="text-blue-600 underline">åbn login-link</a></p>
        )}
        <button onClick={() => { setMessage(''); setDevLink('') }} className="text-xs text-gray-500 underline hover:text-gray-700">
          Prøv igen
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          autoComplete="email"
          placeholder="navn@firma.dk"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1.5">Vi sender et login-link til din e-mail. Ingen adgangskode.</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Sender…' : 'Send login-link'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900">Kronborg Marine</h1>
          <p className="text-sm text-gray-500 mt-1">Bådudstyr Middleware</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Log ind</h2>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Kun til internt brug — Kronborg Marine Bådudstyr
        </p>
      </div>
    </div>
  )
}
