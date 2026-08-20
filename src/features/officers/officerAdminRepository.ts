import type { SupabaseClient } from '@supabase/supabase-js'

export type OfficerRole = 'admin' | 'manager' | 'officer' | 'viewer'
export const OFFICER_ROLES: OfficerRole[] = ['admin', 'manager', 'officer', 'viewer']

export interface OfficerAdminRow {
  id: string
  name: string
  phone: string | null
  employeeCode: string | null
  /** Real contact email for report delivery etc. — distinct from the
   * synthetic `{phone}@rscl.farmsignal` address Supabase Auth uses
   * internally for login, which was never meant to be a deliverable
   * address (see `authRepository.ts`). Nullable — not every officer needs
   * one filled in. */
  email: string | null
  role: string | null
  factoryCode: string | null
  /** The officer's real division scope — from `officer_divisions` when that
   * officer has any rows there (an officer can cover more than one
   * division), falling back to the single `division_code` column on
   * `farm_officers` when they don't. Same fallback order the app's own
   * login/session code already uses (`officerRepository.ts`'s
   * `fetchProfile`) — this list, not the singular column, is what actually
   * governs what an officer/manager/viewer can see. */
  divisionCodes: string[]
  clientCode: string | null
  isActive: boolean
  isSuperAdmin: boolean
  /** Flagged to receive the automated Executive Report email (1st/15th of
   * each month, sent by a separate local script — see
   * `newpy/send_executive_report.py`) — independent of role/isSuperAdmin,
   * same "capability is its own flag, not derived from role" pattern as
   * `isSuperAdmin` itself. */
  receivesExecutiveReport: boolean
}

export interface OfficerAdminInput {
  name: string
  email: string | null
  role: string | null
  factoryCode: string | null
  divisionCodes: string[]
  clientCode: string | null
  isSuperAdmin: boolean
  receivesExecutiveReport: boolean
}

export interface FactoryOption {
  code: string
  name: string
  clientCode: string | null
}

export interface DivisionOption {
  code: string
  name: string
  factoryCode: string
}

/** Admin CRUD for `farm_officers` (+ `officer_divisions`, its multi-division
 * companion table) — edit + deactivate only, no account creation (needs a
 * service-role Edge Function to make a real Supabase Auth login, explicitly
 * deferred — see FarmSignal_Feature_Specs and the plan's Feature 2 scope
 * note). RLS restricts UPDATE to `is_super_admin` officers (see
 * farm_officers_super_admin_update, run alongside this feature), same shape
 * as `ThresholdsRepository`. `officer_divisions` needs its own new
 * INSERT/DELETE policies (same `is_super_admin` gate) — it only had a
 * self-read SELECT policy before this. */
export class OfficerAdminRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listAll(): Promise<OfficerAdminRow[]> {
    const [{ data, error }, { data: odRows, error: odErr }] = await Promise.all([
      this.client
        .from('farm_officers')
        .select(
          'id,name,phone,employee_code,email,role,factory_code,division_code,client_code,is_active,is_super_admin,receives_executive_report',
        )
        .order('name'),
      this.client.from('officer_divisions').select('officer_id,division_code'),
    ])
    if (error) throw error
    if (odErr) throw odErr

    const divsByOfficer: Record<string, string[]> = {}
    for (const r of odRows ?? []) {
      const officerId = r.officer_id as string
      ;(divsByOfficer[officerId] ??= []).push(r.division_code as string)
    }

    return (data ?? []).map((o) => {
      const id = o.id as string
      const fallback = (o.division_code as string | null) ?? null
      return {
        id,
        name: (o.name as string | null) ?? 'Unknown',
        phone: (o.phone as string | null) ?? null,
        employeeCode: (o.employee_code as string | null) ?? null,
        email: (o.email as string | null) ?? null,
        role: (o.role as string | null) ?? null,
        factoryCode: (o.factory_code as string | null) ?? null,
        divisionCodes: divsByOfficer[id]?.length ? divsByOfficer[id] : fallback ? [fallback] : [],
        clientCode: (o.client_code as string | null) ?? null,
        isActive: (o.is_active as boolean | null) ?? false,
        isSuperAdmin: (o.is_super_admin as boolean | null) ?? false,
        receivesExecutiveReport: (o.receives_executive_report as boolean | null) ?? false,
      }
    })
  }

  async listFactories(): Promise<FactoryOption[]> {
    const { data, error } = await this.client.from('factories').select('code,name,group_code').order('name')
    if (error) throw error
    return (data ?? []).map((f) => ({
      code: f.code as string,
      name: f.name as string,
      clientCode: (f.group_code as string | null) ?? null,
    }))
  }

  async listDivisions(): Promise<DivisionOption[]> {
    const { data, error } = await this.client.from('divisions').select('code,name,factory_code').order('name')
    if (error) throw error
    return (data ?? []).map((d) => ({
      code: d.code as string,
      name: d.name as string,
      factoryCode: d.factory_code as string,
    }))
  }

  /** Writes both the `farm_officers` row and the officer's real
   * `officer_divisions` membership in one call — keeping the singular
   * `division_code` column in sync (set to the first selected division, or
   * null) is just a courtesy fallback for any code path that still reads
   * it; `officer_divisions` is the actual source of truth (see
   * `OfficerAdminRow.divisionCodes`' docstring). Replaces the officer's
   * whole `officer_divisions` set (delete then re-insert) rather than
   * diffing — this table is small per officer (a handful of divisions at
   * most), so there's no real cost to the simpler approach. */
  async update(id: string, input: OfficerAdminInput): Promise<void> {
    const { error } = await this.client
      .from('farm_officers')
      .update({
        name: input.name,
        email: input.email,
        role: input.role,
        factory_code: input.factoryCode,
        division_code: input.divisionCodes[0] ?? null,
        client_code: input.clientCode,
        is_super_admin: input.isSuperAdmin,
        receives_executive_report: input.receivesExecutiveReport,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error

    const { error: delErr } = await this.client.from('officer_divisions').delete().eq('officer_id', id)
    if (delErr) throw delErr

    if (input.divisionCodes.length > 0) {
      const { error: insErr } = await this.client
        .from('officer_divisions')
        .insert(input.divisionCodes.map((code) => ({ officer_id: id, division_code: code })))
      if (insErr) throw insErr
    }
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.client
      .from('farm_officers')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  }
}
