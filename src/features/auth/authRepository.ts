import type { AuthResponse, Session, SupabaseClient } from '@supabase/supabase-js'
import { AppAuthError } from './types'

const PHONE_PATTERN = /^\d{10}$/

/** Thin wrapper around Supabase auth. Ports the phone/email login mapping
 * from RS_Cane_Monitoring_S1.html:1449-1531 (sbDoLogin/sbSignOut) — officers
 * sign in with a 10-digit mobile number, mapped to a synthetic email
 * address, the same way the Flutter mobile app does, so all three apps
 * authenticate identically against the same Supabase project. */
export class AuthRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession()
    return data.session
  }

  onAuthStateChange(callback: Parameters<SupabaseClient['auth']['onAuthStateChange']>[0]) {
    return this.client.auth.onAuthStateChange(callback)
  }

  async signIn(identifier: string, pin: string): Promise<AuthResponse> {
    const trimmedIdentifier = identifier.trim()
    const trimmedPin = pin.trim()

    if (!trimmedIdentifier) throw new AppAuthError('Please enter your mobile number.')
    if (!trimmedPin) throw new AppAuthError('Please enter your PIN.')

    const isPhone = PHONE_PATTERN.test(trimmedIdentifier)
    const isEmail = trimmedIdentifier.includes('@')
    if (!isPhone && !isEmail) {
      throw new AppAuthError('Enter a 10-digit mobile number or email address.')
    }

    const email = isPhone ? `${trimmedIdentifier}@rscl.farmsignal` : trimmedIdentifier

    const response = await this.client.auth.signInWithPassword({ email, password: trimmedPin })
    if (response.error) {
      throw new AppAuthError('Invalid mobile number or PIN. Please try again.')
    }
    return response
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }
}
