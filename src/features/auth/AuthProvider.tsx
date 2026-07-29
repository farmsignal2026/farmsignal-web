import { createContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AuthRepository } from './authRepository'
import { OfficerRepository } from './officerRepository'
import { roleToLabel } from './roleLabel'
import type { AppUser } from './types'

export type AuthStatus = 'loading' | 'anon' | 'authed'

export interface AuthContextValue {
  status: AuthStatus
  user: AppUser | null
  error: string | null
  signIn: (identifier: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const authRepo = new AuthRepository(supabase)
const officerRepo = new OfficerRepository(supabase)

async function hydrateUser(authUserId: string, email: string | null | undefined): Promise<AppUser> {
  const officer = await officerRepo.fetchProfile(authUserId)
  const rawEmail = email ?? ''
  const username = rawEmail.endsWith('@rscl.farmsignal') ? rawEmail.slice(0, rawEmail.indexOf('@')) : rawEmail

  if (!officer) {
    // No farm_officers row — true super-admin login by email (matches
    // RS_Cane_Monitoring_S1.html:1493-1498).
    return {
      username,
      name: username,
      officerId: null,
      role: 'admin',
      roleLabel: roleToLabel('admin', null),
      factoryCode: null,
      factoryName: null,
      clientCode: null,
      divisionCode: null,
      divisionCodes: [],
    }
  }

  return {
    username,
    name: officer.name,
    officerId: officer.id,
    role: officer.role,
    roleLabel: roleToLabel(officer.role, officer.factoryCode),
    factoryCode: officer.factoryCode,
    factoryName: officer.factoryName,
    clientCode: officer.clientCode,
    divisionCode: officer.divisionCode,
    divisionCodes: officer.divisionCodes,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AppUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    ;(async () => {
      try {
        const session = await authRepo.getSession()
        if (!session) {
          setStatus('anon')
          return
        }
        const hydrated = await hydrateUser(session.user.id, session.user.email)
        setUser(hydrated)
        setStatus('authed')
      } catch {
        // Leave the login screen visible — user will sign in manually.
        setStatus('anon')
      }
    })()
  }, [])

  const signIn = async (identifier: string, pin: string) => {
    setError(null)
    try {
      const response = await authRepo.signIn(identifier, pin)
      const authedUser = response.data.user
      if (!authedUser) throw new Error('Login failed. Please try again.')
      const hydrated = await hydrateUser(authedUser.id, authedUser.email)
      setUser(hydrated)
      setStatus('authed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed. Please try again.')
      throw e
    }
  }

  const signOut = async () => {
    await authRepo.signOut()
    setUser(null)
    setStatus('anon')
  }

  return (
    <AuthContext.Provider value={{ status, user, error, signIn, signOut }}>{children}</AuthContext.Provider>
  )
}
