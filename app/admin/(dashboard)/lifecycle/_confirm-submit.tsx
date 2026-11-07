'use client'

import { useFormStatus } from 'react-dom'

export function ConfirmSubmit({ label, confirmText, disabled }: { label: string; confirmText: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={e => { if (!confirm(confirmText)) e.preventDefault() }}
      className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
      {pending ? 'Sender…' : label}
    </button>
  )
}
