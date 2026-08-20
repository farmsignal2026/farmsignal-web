import type { SupabaseClient } from '@supabase/supabase-js'
import { stages as DEFAULT_STAGES, type GrowthStage } from './growthStage'

export interface ThresholdRow {
  crop: string
  clientCode: string | null
  factoryCode: string | null
  stageName: string
  dayMin: number
  dayMax: number
  ndviMin: number
  ndviMax: number
}

/** Whole `crop_stage_thresholds` table — always small (a handful of rows
 * per client/factory), so unlike the observation tables in
 * `fieldsRepository.ts` this needs no pagination. */
export async function fetchThresholds(client: SupabaseClient): Promise<ThresholdRow[]> {
  const { data, error } = await client
    .from('crop_stage_thresholds')
    .select('crop,client_code,factory_code,stage_name,day_min,day_max,ndvi_min,ndvi_max')
  if (error) throw error
  return (data ?? []).map((r) => ({
    crop: r.crop as string,
    clientCode: (r.client_code as string | null) ?? null,
    factoryCode: (r.factory_code as string | null) ?? null,
    stageName: r.stage_name as string,
    dayMin: r.day_min as number,
    dayMax: r.day_max as number,
    ndviMin: Number(r.ndvi_min),
    ndviMax: Number(r.ndvi_max),
  }))
}

/** Most-specific-wins, resolved independently per stage: a factory-level
 * row beats a client-wide row beats the global-default row. Falls back to
 * the hardcoded `DEFAULT_STAGES` value for any stage with no matching row
 * at all — covers both "table is completely empty" (right after this
 * feature ships, before seeding) and "this crop/client has nothing
 * configured yet" with the same safety net, rather than only guarding the
 * all-or-nothing empty-table case.
 *
 * `day_min` in the source rows is informational/display-only — mirrors
 * `stageForAge()`'s own pre-existing behavior of deriving each stage's
 * effective start day purely from the PREVIOUS stage's `cumEnd`
 * (`day_max`), never from that stage's own declared start. This resolver
 * preserves that property faithfully rather than introducing a new one.
 *
 * `expNdvi` isn't part of the configurable schema (no column for it) — for
 * an overridden stage it's recomputed as the midpoint of the resolved
 * tMin/tMax, so a client with materially different thresholds (e.g. MEHTA)
 * doesn't end up with an "expected NDVI" display value that reads outside
 * their own configured range. For an unmatched stage it stays exactly the
 * hardcoded default. */
export function resolveStagesForFactory(
  rows: ThresholdRow[],
  crop: string,
  clientCode: string | null,
  factoryCode: string | null,
): GrowthStage[] {
  const rankOf = (r: ThresholdRow): number => {
    if (factoryCode != null && r.factoryCode === factoryCode && r.clientCode === clientCode) return 3
    if (clientCode != null && r.clientCode === clientCode && r.factoryCode === null) return 2
    if (r.clientCode === null && r.factoryCode === null) return 1
    return 0
  }

  const bestByStage = new Map<string, { row: ThresholdRow; rank: number }>()
  for (const r of rows) {
    if (r.crop !== crop) continue
    const rank = rankOf(r)
    if (rank === 0) continue
    const existing = bestByStage.get(r.stageName)
    if (!existing || rank > existing.rank) bestByStage.set(r.stageName, { row: r, rank })
  }

  return DEFAULT_STAGES.map((defaultStage): GrowthStage => {
    const match = bestByStage.get(defaultStage.name)?.row
    if (!match) return defaultStage
    return {
      name: defaultStage.name,
      short: defaultStage.short,
      days: match.dayMax - match.dayMin,
      cumEnd: match.dayMax,
      tMin: match.ndviMin,
      tMax: match.ndviMax,
      expNdvi: Number(((match.ndviMin + match.ndviMax) / 2).toFixed(2)),
    }
  })
}

/** Builds one resolved `GrowthStage[]` per distinct factory present in the
 * current field set, keyed `"<clientCode>|<factoryCode>"` — cheap since
 * there are only ever a handful of factories, not one resolve per field.
 * `crop` is hardcoded to `'Sugarcane'` at the one call site for now (see
 * `resolveStagesForFactory`'s own note on why it's a parameter, not an
 * assumption baked into the resolver itself). */
export function buildStageResolverCache(
  rows: ThresholdRow[],
  crop: string,
  factories: { clientCode: string | null; factoryCode: string | null }[],
): Map<string, GrowthStage[]> {
  const cache = new Map<string, GrowthStage[]>()
  for (const f of factories) {
    const key = `${f.clientCode ?? ''}|${f.factoryCode ?? ''}`
    if (!cache.has(key)) cache.set(key, resolveStagesForFactory(rows, crop, f.clientCode, f.factoryCode))
  }
  return cache
}
