import type { SupabaseClient } from '@supabase/supabase-js'
import { stages as DEFAULT_STAGES } from './growthStage'

export interface ThresholdAdminRow {
  id: string
  crop: string
  clientCode: string | null
  factoryCode: string | null
  stageName: string
  stageOrder: number
  dayMin: number
  dayMax: number
  ndviMin: number
  ndviMax: number
  updatedAt: string | null
  updatedByName: string | null
}

export interface ThresholdInput {
  crop: string
  clientCode: string | null
  factoryCode: string | null
  stageName: string
  stageOrder: number
  dayMin: number
  dayMax: number
  ndviMin: number
  ndviMax: number
}

export interface FactoryOption {
  code: string
  name: string
  clientCode: string | null
}

/** Canonical stage names/order, reused so the add-row form doesn't need its
 * own hardcoded copy — `DEFAULT_STAGES` is the same 5-stage list every
 * client/factory row is expected to override, one row per stage. */
export const STAGE_NAMES = DEFAULT_STAGES.map((s, i) => ({ name: s.name, order: i + 1 }))

/** Supabase's FK-join typing can't tell `updated_by(name)` resolves to a
 * single row (it's a to-one join on a plain FK column), so it comes back
 * typed as possibly-an-array either way at runtime — normalize both shapes. */
function extractOfficerName(joined: unknown): string | null {
  const row = Array.isArray(joined) ? joined[0] : joined
  return (row as { name?: string } | null)?.name ?? null
}

/** Admin CRUD for `crop_stage_thresholds` — RLS restricts INSERT/UPDATE/
 * DELETE to `is_super_admin` officers (see crop_stage_thresholds_setup.sql),
 * so a non-super-admin calling these gets a Postgres RLS error, not a silent
 * no-op; the Thresholds nav button itself is also gated `isSuperAdmin` as a
 * first line of defense. */
export class ThresholdsRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listAll(): Promise<ThresholdAdminRow[]> {
    const { data, error } = await this.client
      .from('crop_stage_thresholds')
      .select('id,crop,client_code,factory_code,stage_name,stage_order,day_min,day_max,ndvi_min,ndvi_max,updated_at,updated_by(name)')
      .order('client_code', { ascending: true, nullsFirst: true })
      .order('factory_code', { ascending: true, nullsFirst: true })
      .order('stage_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id as string,
      crop: r.crop as string,
      clientCode: (r.client_code as string | null) ?? null,
      factoryCode: (r.factory_code as string | null) ?? null,
      stageName: r.stage_name as string,
      stageOrder: r.stage_order as number,
      dayMin: r.day_min as number,
      dayMax: r.day_max as number,
      ndviMin: Number(r.ndvi_min),
      ndviMax: Number(r.ndvi_max),
      updatedAt: (r.updated_at as string | null) ?? null,
      updatedByName: extractOfficerName(r.updated_by),
    }))
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

  async insert(row: ThresholdInput, officerId: string | null): Promise<void> {
    const { error } = await this.client.from('crop_stage_thresholds').insert({
      crop: row.crop,
      client_code: row.clientCode,
      factory_code: row.factoryCode,
      stage_name: row.stageName,
      stage_order: row.stageOrder,
      day_min: row.dayMin,
      day_max: row.dayMax,
      ndvi_min: row.ndviMin,
      ndvi_max: row.ndviMax,
      updated_by: officerId,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  async update(id: string, row: ThresholdInput, officerId: string | null): Promise<void> {
    const { error } = await this.client
      .from('crop_stage_thresholds')
      .update({
        day_min: row.dayMin,
        day_max: row.dayMax,
        ndvi_min: row.ndviMin,
        ndvi_max: row.ndviMax,
        updated_by: officerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('crop_stage_thresholds').delete().eq('id', id)
    if (error) throw error
  }
}
