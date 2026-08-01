import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSpellingMap, type ImportLookups, type ValidatedImportRow } from './import'

export interface ImportResult {
  okCount: number
  failed: { plotNo: string; message: string }[]
}

/** Writes for the new-field import feature — a `plots` row (location side),
 * a `plot_seasons` row (current crop-cycle side), and (only when Farmer
 * Code wasn't already known) a new `farmers` row, per validated field.
 * Requires three new Supabase RLS policies that did NOT exist before this
 * feature (`plots`/`plot_seasons`/`farmers` had SELECT-only policies, no
 * INSERT at all) — see the policies given to the user alongside this file. */
export class ImportRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  /** Reference codes to validate uploaded rows against, plus existing
   * `plot_no`s for duplicate detection — all read under the same RLS the
   * rest of the app already relies on (divisions/sections/villages/
   * factories are `public_read`; `plots`/`farmers` already have admin/
   * manager SELECT policies this feature is gated behind anyway). */
  async loadLookups(): Promise<ImportLookups> {
    const [facRes, divRes, secRes, vilRes, farmRes, plotRes, seasonRes] = await Promise.all([
      this.client.from('factories').select('code,name,group_code'),
      this.client.from('divisions').select('code,name'),
      this.client.from('sections').select('code,name'),
      this.client.from('villages').select('code,name'),
      this.client.from('farmers').select('id,farmer_code,name'),
      this.client.from('plots').select('plot_no'),
      this.client.from('plot_seasons').select('variety_name,irrigation_type,water_source,soil_type,seed_type'),
    ])

    const seasonRows = seasonRes.data ?? []
    const varietySpellings = buildSpellingMap(seasonRows.map((r) => (r.variety_name as string | null) ?? ''))
    const irrigationSpellings = buildSpellingMap(seasonRows.map((r) => (r.irrigation_type as string | null) ?? ''))
    const waterSourceSpellings = buildSpellingMap(seasonRows.map((r) => (r.water_source as string | null) ?? ''))
    const soilTypeSpellings = buildSpellingMap(seasonRows.map((r) => (r.soil_type as string | null) ?? ''))
    const seedTypeSpellings = buildSpellingMap(seasonRows.map((r) => (r.seed_type as string | null) ?? ''))
    const sortedValues = (m: Map<string, string>) => [...m.values()].sort((a, b) => a.localeCompare(b))

    return {
      factoryCodes: new Set((facRes.data ?? []).map((r) => r.code as string)),
      divisionCodes: new Set((divRes.data ?? []).map((r) => r.code as string)),
      sectionCodes: new Set((secRes.data ?? []).map((r) => r.code as string)),
      villageCodes: new Set((vilRes.data ?? []).map((r) => r.code as string)),
      clientCodeByFactory: new Map((facRes.data ?? []).map((r) => [r.code as string, (r.group_code as string | null) ?? null])),
      farmerIdByCode: new Map((farmRes.data ?? []).map((r) => [r.farmer_code as string, r.id as string])),
      farmerNameByCode: new Map((farmRes.data ?? []).map((r) => [r.farmer_code as string, (r.name as string | null) ?? ''])),
      existingPlotNos: new Set((plotRes.data ?? []).map((r) => r.plot_no as string)),
      freeTextBySpellingKey: {
        variety: varietySpellings,
        irrigationType: irrigationSpellings,
        waterSource: waterSourceSpellings,
        soilType: soilTypeSpellings,
        seedType: seedTypeSpellings,
      },
      masterData: {
        factories: (facRes.data ?? []).map((r) => ({ code: r.code as string, name: (r.name as string | null) ?? '' })),
        divisions: (divRes.data ?? []).map((r) => ({ code: r.code as string, name: (r.name as string | null) ?? '' })),
        sections: (secRes.data ?? []).map((r) => ({ code: r.code as string, name: (r.name as string | null) ?? '' })),
        villages: (vilRes.data ?? []).map((r) => ({ code: r.code as string, name: (r.name as string | null) ?? '' })),
        farmers: (farmRes.data ?? []).map((r) => ({ code: r.farmer_code as string, name: (r.name as string | null) ?? '' })),
        varieties: sortedValues(varietySpellings),
        irrigationTypes: sortedValues(irrigationSpellings),
        waterSources: sortedValues(waterSourceSpellings),
        soilTypes: sortedValues(soilTypeSpellings),
        seedTypes: sortedValues(seedTypeSpellings),
      },
    }
  }

  /** Creates the farmer if `farmerCode` isn't already known, otherwise
   * reuses whatever id is already on record for that code — deliberately
   * does NOT overwrite an existing farmer's name/phone/village even if the
   * row typed different values, since a code collision could belong to a
   * genuinely different real farmer (an accidental typo of someone else's
   * code shouldn't silently rename them). If the INSERT itself fails
   * (e.g. `farmer_code` already exists — created by an earlier row in this
   * same batch that beat this one, an earlier partial import run, or
   * simply not present in the lookup snapshot taken when the modal opened),
   * falls back to looking the id up by code instead of failing the row —
   * this is the "upsert" behavior: create if new, reuse if not, never
   * silently drop the row's farmer link. */
  private async resolveFarmerId(row: ValidatedImportRow, createdFarmerIds: Map<string, string>): Promise<string> {
    if (row.farmerId) return row.farmerId

    const cached = createdFarmerIds.get(row.farmerCode)
    if (cached) return cached

    const { data: inserted, error: insertErr } = await this.client
      .from('farmers')
      .insert({
        farmer_code: row.farmerCode,
        name: row.newFarmerName,
        phone: row.newFarmerPhone,
        village_code: row.villageCode,
        is_active: true,
      })
      .select('id')
      .single()

    if (!insertErr && inserted?.id) {
      const id = inserted.id as string
      createdFarmerIds.set(row.farmerCode, id)
      return id
    }

    const { data: existing, error: selectErr } = await this.client
      .from('farmers')
      .select('id')
      .eq('farmer_code', row.farmerCode)
      .single()
    if (selectErr || !existing?.id) {
      throw insertErr ?? new Error(`Could not create or find farmer "${row.farmerCode}"`)
    }
    const id = existing.id as string
    createdFarmerIds.set(row.farmerCode, id)
    return id
  }

  /** One `plots` insert + one `plot_seasons` insert per row, sequential and
   * independently caught so one bad row doesn't abort the whole batch —
   * same per-row try/catch pattern as `OfficersRepository.assignFieldsToOfficer`.
   * New plots default `is_mapped: false` (no GPS boundary yet — that's a
   * separate survey process, out of scope here) and `is_active: true`.
   * Unlike the farmer step, `plots`/`plot_seasons` are NEVER upserted — a
   * `plot_no` collision here should surface as a loud, visible error (it
   * means the validation-time uniqueness check missed something), not
   * silently merge into or overwrite a real existing plot's data. */
  async importFields(rows: ValidatedImportRow[]): Promise<ImportResult> {
    const result: ImportResult = { okCount: 0, failed: [] }
    const createdFarmerIds = new Map<string, string>() // farmerCode -> id, within this run

    for (const row of rows) {
      try {
        const farmerId = await this.resolveFarmerId(row, createdFarmerIds)

        const { data: plotRow, error: plotErr } = await this.client
          .from('plots')
          .insert({
            plot_no: row.plotNo,
            factory_code: row.factoryCode,
            division_code: row.divisionCode,
            section_code: row.sectionCode,
            village_code: row.villageCode,
            is_active: true,
            is_mapped: false,
          })
          .select('id')
          .single()
        if (plotErr) throw plotErr

        const { error: seasonErr } = await this.client.from('plot_seasons').insert({
          plot_id: plotRow.id,
          plot_no: row.plotNo,
          farmer_id: farmerId,
          farmer_code: row.farmerCode,
          planting_date: row.plantingDate,
          planting_season: row.plantingSeason || null,
          crushing_season: row.crushingSeason || null,
          plot_type: row.plotType,
          crop_type: row.cropType,
          variety_name: row.variety,
          irrigation_type: row.irrigationType || null,
          water_source: row.waterSource || null,
          soil_type: row.soilType || null,
          seed_type: row.seedType || null,
          spacing_feet: row.spacingFeet || null,
          area_acres: row.areaAcres,
        })
        if (seasonErr) throw seasonErr

        result.okCount++
      } catch (e) {
        result.failed.push({ plotNo: row.plotNo, message: e instanceof Error ? e.message : String(e) })
      }
    }

    return result
  }
}
