'use client'

import { useFormStatus } from 'react-dom'

// Submit-knap til server actions: viser en spinner og ventetekst, mens formularen sendes,
// og kan ikke trykkes igen imens (fx login-bekræftelse, hvor et dobbeltklik ville bruge tokenet to gange).
export function PendingSubmit({ label, pendingLabel, className }: { label: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: pending ? 'wait' : undefined }}>
      {pending && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'pending-spin .8s linear infinite' }}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending ? pendingLabel : label}
      <style>{'@keyframes pending-spin { to { transform: rotate(360deg) } }'}</style>
    </button>
  )
}
