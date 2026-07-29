import { useState, type FormEvent } from 'react'
import { useAuth } from './useAuth'

/** Ports the login modal (RS_Cane_Monitoring_S1.html:1439-1531,
 * #sbEmail/#sbPassword/#sbLoginBtn/#sbLoginErr) — phone+PIN or email+PIN,
 * same synthetic-email mapping as the mobile app. */
export function LoginScreen() {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !pin.trim()) {
      setErrorMessage('Please enter your mobile number and PIN.')
      return
    }
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await signIn(identifier, pin)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-neutral-800">FarmSignal Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to load field data</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="sbEmail" className="mb-1 block text-xs font-medium text-neutral-600">
              Mobile number or email
            </label>
            <input
              id="sbEmail"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="sbPassword" className="mb-1 block text-xs font-medium text-neutral-600">
              PIN
            </label>
            <input
              id="sbPassword"
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
            />
          </div>

          {errorMessage && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#1a3a2a] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  )
}
