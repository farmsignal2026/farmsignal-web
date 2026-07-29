import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfficerProfile, Role } from './types'

/** Ports the officer-profile fetch from RS_Cane_Monitoring_S1.html
 * (:1462-1498 sbDoLogin, :1917-1937 session restore).
 *
 * Division-code scoping deliberately fetches `officer_divisions` for
 * 'manager' too, not just 'officer'/'viewer' as this HTML currently does —
 * matching the already-verified Flutter mobile app
 * (farmsignal_flutter/lib/features/auth/data/officer_repository.dart),
 * which fixed a real inconsistency between the two live apps. */
export class OfficerRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async fetchProfile(authUserId: string): Promise<OfficerProfile | null> {
    const { data: officers } = await this.client
      .from('farm_officers')
      .select('id,name,role,factory_code,division_code,client_code')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .limit(1)

    if (!officers || officers.length === 0) return null

    const officer = officers[0]
    const role = officer.role as Role
    const officerId = officer.id as string
    const factoryCode = (officer.factory_code as string | null) ?? null
    const officerDivisionCode = (officer.division_code as string | null) ?? null

    let divisionCodes: string[] = []
    if (role === 'officer' || role === 'viewer' || role === 'manager') {
      const { data: odRows } = await this.client
        .from('officer_divisions')
        .select('division_code')
        .eq('officer_id', officerId)
      if (odRows && odRows.length > 0) {
        divisionCodes = odRows.map((r) => r.division_code as string)
      } else if (officerDivisionCode) {
        divisionCodes = [officerDivisionCode]
      }
    }

    let factoryName: string | null = null
    let clientCode = (officer.client_code as string | null) ?? null
    if (factoryCode) {
      const { data: facRows } = await this.client
        .from('factories')
        .select('name,group_code')
        .eq('code', factoryCode)
        .limit(1)
      if (facRows && facRows.length > 0) {
        const fac = facRows[0]
        factoryName = (fac.name as string | null) ?? null
        clientCode ??= (fac.group_code as string | null) ?? null
      }
    }

    return {
      id: officerId,
      name: officer.name as string,
      role,
      factoryCode,
      factoryName,
      clientCode,
      divisionCode: officerDivisionCode,
      divisionCodes,
    }
  }
}
