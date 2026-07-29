import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

function App() {
  const [supabaseReady, setSupabaseReady] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    // A lightweight, unauthenticated call just to prove the client
    // actually reaches Supabase end-to-end — real data loading (behind
    // login) is Phase 1, not this scaffold.
    supabase.auth
      .getSession()
      .then(() => setSupabaseReady('ok'))
      .catch(() => setSupabaseReady('error'))
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-800">FarmSignal Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-500">Phase 0 scaffold — Vite + React + TypeScript + Tailwind</p>

        <div className="mt-6 flex items-center justify-center gap-2 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-600">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              supabaseReady === 'ok'
                ? 'bg-green-400'
                : supabaseReady === 'error'
                  ? 'bg-red-400'
                  : 'bg-amber-400'
            }`}
          />
          {supabaseReady === 'checking' && 'Connecting to Supabase…'}
          {supabaseReady === 'ok' && 'Supabase client connected'}
          {supabaseReady === 'error' && 'Could not reach Supabase'}
        </div>
      </div>
    </div>
  )
}

export default App
