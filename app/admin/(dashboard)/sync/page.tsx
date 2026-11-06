'use client'

export default function SyncPage() {
  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Sync & Logs</h2>
      <p className="text-gray-500 mb-8">Kommende integrationer og synkronisering.</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6 opacity-60">
        <h3 className="text-base font-semibold text-gray-900 mb-1">admind POS ↔ Supabase</h3>
        <p className="text-sm text-gray-500">Webhook-modtagelse og lager-sync. Implementeres når API-dokumentation foreligger.</p>
        <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Ikke konfigureret endnu</span>
      </div>
    </div>
  )
}
