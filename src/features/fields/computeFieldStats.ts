import type { Field, FieldGeo } from './types'

export type StatCardKey = 'good' | 'optimal' | 'attention' | 'serious' | 'watch'

export interface StatBucket {
  key: StatCardKey
  label: string
  count: number
  acres: number
}

export interface FieldStats {
  totalCount: number
  totalAcres: number
  buckets: Record<StatCardKey, StatBucket>
}

function areaOf(field: Field): number {
  const n = Number.parseFloat(field.area)
  return Number.isFinite(n) ? n : 0
}

export const DEFAULT_WATCH_THRESHOLD = 0.1

/** A Good/Moderate field with a significant recent NDVI drop — a separate
 * flag layered on top of health status, not a 6th classification bucket.
 * Ports the "Watch alert" card (RS_Cane_Monitoring_S1.html:797-817).
 * Exported so filterFields.ts can apply the "Watch" stat-card filter. */
export function isWatch(field: Field, geo: FieldGeo | undefined, threshold: number): boolean {
  if (!geo || geo.ndvi === null || geo.prevNdvi === null) return false
  if (field.healthStatus !== 'good' && field.healthStatus !== 'optimal') return false
  return geo.prevNdvi - geo.ndvi >= threshold
}

/** Ports `renderStats()` (RS_Cane_Monitoring_S1.html:4223+) — counts and
 * acreage per health-status bucket, plus the separate Watch flag. */
export function computeFieldStats(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  watchThreshold: number = DEFAULT_WATCH_THRESHOLD,
): FieldStats {
  const totalAcres = fields.reduce((sum, f) => sum + areaOf(f), 0)

  const make = (key: StatCardKey, label: string, matches: Field[]): StatBucket => ({
    key,
    label,
    count: matches.length,
    acres: matches.reduce((sum, f) => sum + areaOf(f), 0),
  })

  const good = fields.filter((f) => f.healthStatus === 'good')
  const optimal = fields.filter((f) => f.healthStatus === 'optimal')
  const attention = fields.filter((f) => f.healthStatus === 'attention')
  const serious = fields.filter((f) => f.healthStatus === 'serious')
  const watch = fields.filter((f) => isWatch(f, geoByCode[f.code], watchThreshold))

  return {
    totalCount: fields.length,
    totalAcres,
    buckets: {
      good: make('good', 'Good', good),
      optimal: make('optimal', 'Moderate', optimal),
      attention: make('attention', 'Need Attention', attention),
      serious: make('serious', 'Need Serious Attention', serious),
      watch: make('watch', 'Watch', watch),
    },
  }
}
