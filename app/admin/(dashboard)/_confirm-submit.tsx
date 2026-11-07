'use client'

import { useFormStatus } from 'react-dom'

const DEFAULT_CLS = 'px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium'

export function ConfirmSubmit({ label, confirmText, disabled, pendingLabel = 'Sender…', className = DEFAULT_CLS }: {
  label: string; confirmText: string; disabled?: boolean; pendingLabel?: string; className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={e => { if (!confirm(confirmText)) e.preventDefault() }}
      className={className}>
      {pending ? pendingLabel : label}
    </button>
  )
}
