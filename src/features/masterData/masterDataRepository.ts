import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClientRow {
  id: string
  code: string
  name: string
}

export interface FactoryRow {
  id: string
  code: string
  name: string
  clientCode: string | null
}

export interface DivisionRow {
  id: string
  code: string
  name: string
  factoryCode: string
}

export interface SectionRow {
  id: string
  code: string
  name: string
  divisionCode: string
  description: string | null
}

export interface VillageRow {
  id: string
  code: string
  name: string
  sectionCode: string
  district: string | null
  state: string | null
  taluk: string | null
}

/** Admin CRUD for the plot-hierarchy master tables (Client -> Factory ->
 * Division -> Section -> Village) — `factories`/`divisions`/`sections`/
 * `villages` each had `public_read`-only RLS before this (open SELECT, no
 * writes at all), same gap pattern Import Fields and Manage Officers already
 * found on other tables — needs one INSERT/UPDATE/DELETE policy set per
 * table, gated `is_super_admin`, run alongside this feature.
 *
 * `client_master` is a genuinely separate case: it exists in the schema but
 * nothing in this app ever reads or writes it — client codes are plain free
 * text everywhere else (`factories.group_code`, `farm_officers.client_code`,
 * `crop_stage_thresholds.client_code`). Adding it here as its own tab gives
 * a real place to maintain a client name list, but doesn't retroactively
 * couple it to `factories.group_code` — that field stays free text (see
 * MasterDataModal.tsx) so existing data that doesn't already line up 1:1
 * with `client_master` isn't put at risk of silently breaking.
 *
 * `code` columns aren't real foreign keys in this schema (plain text
 * matches, no FK constraint) — deleting a parent row wouldn't be blocked at
 * the database level even if plots/officers/children still reference it by
 * code, so each `delete*` method here does its own child-row check first
 * and refuses rather than silently orphaning data. Deliberately checks only
 * the immediate child table (e.g. Divisions for a Factory), not
 * plots/farm_officers several levels down — those keep the old code as
 * plain text either way, same as before this feature existed. */
export class MasterDataRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listClients(): Promise<ClientRow[]> {
    const { data, error } = await this.client.from('client_master').select('id,code,name').order('name')
    if (error) throw error
    return (data ?? []).map((c) => ({ id: c.id as string, code: c.code as string, name: c.name as string }))
  }

  async insertClient(input: { code: string; name: string }): Promise<void> {
    const { error } = await this.client.from('client_master').insert({ code: input.code, name: input.name })
    if (error) throw error
  }

  async updateClient(id: string, input: { code: string; name: string }): Promise<void> {
    const { error } = await this.client.from('client_master').update({ code: input.code, name: input.name }).eq('id', id)
    if (error) throw error
  }

  /** `factories.group_code` isn't a real FK to `client_master.code` (this
   * table isn't referenced anywhere in the app today — see this file's own
   * docstring), so unlike the other delete* methods this can't do a
   * meaningful child-row check against Factories; it can only warn. */
  async deleteClient(code: string, name: string): Promise<void> {
    const { count, error: countErr } = await this.client
      .from('factories')
      .select('id', { count: 'exact', head: true })
      .eq('group_code', code)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) {
      throw new Error(`Can't delete — ${count} factory/factories still list "${name}" (${code}) as their Client Code.`)
    }
    const { error } = await this.client.from('client_master').delete().eq('code', code)
    if (error) throw error
  }

  async listFactories(): Promise<FactoryRow[]> {
    const { data, error } = await this.client.from('factories').select('id,code,name,group_code').order('name')
    if (error) throw error
    return (data ?? []).map((f) => ({
      id: f.id as string,
      code: f.code as string,
      name: f.name as string,
      clientCode: (f.group_code as string | null) ?? null,
    }))
  }

  async insertFactory(input: { code: string; name: string; clientCode: string | null }): Promise<void> {
    const { error } = await this.client
      .from('factories')
      .insert({ code: input.code, name: input.name, group_code: input.clientCode })
    if (error) throw error
  }

  async updateFactory(id: string, input: { code: string; name: string; clientCode: string | null }): Promise<void> {
    const { error } = await this.client
      .from('factories')
      .update({ code: input.code, name: input.name, group_code: input.clientCode })
      .eq('id', id)
    if (error) throw error
  }

  async deleteFactory(code: string): Promise<void> {
    const { count, error: countErr } = await this.client
      .from('divisions')
      .select('id', { count: 'exact', head: true })
      .eq('factory_code', code)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) throw new Error(`Can't delete — ${count} division(s) still belong to this factory.`)
    const { error } = await this.client.from('factories').delete().eq('code', code)
    if (error) throw error
  }

  async listDivisions(): Promise<DivisionRow[]> {
    const { data, error } = await this.client.from('divisions').select('id,code,name,factory_code').order('name')
    if (error) throw error
    return (data ?? []).map((d) => ({
      id: d.id as string,
      code: d.code as string,
      name: d.name as string,
      factoryCode: d.factory_code as string,
    }))
  }

  async insertDivision(input: { code: string; name: string; factoryCode: string }): Promise<void> {
    const { error } = await this.client
      .from('divisions')
      .insert({ code: input.code, name: input.name, factory_code: input.factoryCode })
    if (error) throw error
  }

  async updateDivision(id: string, input: { code: string; name: string; factoryCode: string }): Promise<void> {
    const { error } = await this.client
      .from('divisions')
      .update({ code: input.code, name: input.name, factory_code: input.factoryCode })
      .eq('id', id)
    if (error) throw error
  }

  async deleteDivision(code: string): Promise<void> {
    const { count, error: countErr } = await this.client
      .from('sections')
      .select('id', { count: 'exact', head: true })
      .eq('division_code', code)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) throw new Error(`Can't delete — ${count} section(s) still belong to this division.`)
    const { error } = await this.client.from('divisions').delete().eq('code', code)
    if (error) throw error
  }

  async listSections(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select('id,code,name,division_code,description')
      .order('name')
    if (error) throw error
    return (data ?? []).map((s) => ({
      id: s.id as string,
      code: s.code as string,
      name: s.name as string,
      divisionCode: s.division_code as string,
      description: (s.description as string | null) ?? null,
    }))
  }

  async insertSection(input: { code: string; name: string; divisionCode: string; description: string | null }): Promise<void> {
    const { error } = await this.client.from('sections').insert({
      code: input.code,
      name: input.name,
      division_code: input.divisionCode,
      description: input.description,
    })
    if (error) throw error
  }

  async updateSection(
    id: string,
    input: { code: string; name: string; divisionCode: string; description: string | null },
  ): Promise<void> {
    const { error } = await this.client
      .from('sections')
      .update({ code: input.code, name: input.name, division_code: input.divisionCode, description: input.description })
      .eq('id', id)
    if (error) throw error
  }

  async deleteSection(code: string): Promise<void> {
    const { count, error: countErr } = await this.client
      .from('villages')
      .select('id', { count: 'exact', head: true })
      .eq('section_code', code)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) throw new Error(`Can't delete — ${count} village(s) still belong to this section.`)
    const { error } = await this.client.from('sections').delete().eq('code', code)
    if (error) throw error
  }

  async listVillages(): Promise<VillageRow[]> {
    const { data, error } = await this.client
      .from('villages')
      .select('id,code,name,section_code,district,state,taluk')
      .order('name')
    if (error) throw error
    return (data ?? []).map((v) => ({
      id: v.id as string,
      code: v.code as string,
      name: v.name as string,
      sectionCode: v.section_code as string,
      district: (v.district as string | null) ?? null,
      state: (v.state as string | null) ?? null,
      taluk: (v.taluk as string | null) ?? null,
    }))
  }

  async insertVillage(input: {
    code: string
    name: string
    sectionCode: string
    district: string | null
    state: string | null
    taluk: string | null
  }): Promise<void> {
    const { error } = await this.client.from('villages').insert({
      code: input.code,
      name: input.name,
      section_code: input.sectionCode,
      district: input.district,
      state: input.state,
      taluk: input.taluk,
    })
    if (error) throw error
  }

  async updateVillage(
    id: string,
    input: { code: string; name: string; sectionCode: string; district: string | null; state: string | null; taluk: string | null },
  ): Promise<void> {
    const { error } = await this.client
      .from('villages')
      .update({
        code: input.code,
        name: input.name,
        section_code: input.sectionCode,
        district: input.district,
        state: input.state,
        taluk: input.taluk,
      })
      .eq('id', id)
    if (error) throw error
  }

  /** No child-row check needed — Village is the bottom of this hierarchy
   * (Farmers/Plots reference it by code but, same as every delete here,
   * that's a plain-text reference with no FK to enforce). */
  async deleteVillage(id: string): Promise<void> {
    const { error } = await this.client.from('villages').delete().eq('id', id)
    if (error) throw error
  }
}
