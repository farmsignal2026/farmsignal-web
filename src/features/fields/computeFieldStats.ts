import type { Field, FieldGeo } from './types'

export type StatCardKey = 'good' | 'optimal' | 'attention' | 'serious' | 'watch'

export interface StatBucket {
  key: StatCardKey
  label: string
  count: number
  acres: number
  pixelBreakdown: PixelBreakdown | null
}

export interface FieldStats {
  totalCount: number
  totalAcres: number
  totalPixelBreakdown: PixelBreakdown | null
  buckets: Record<StatCardKey, StatBucket>
}

export interface PixelBreakdown {
  goodPct: number
  modPct: number
  attnPct: number
}

/** Ports `areaFor()` (RS_Cane_Monitoring_S1.html:4226-4234, 7304-7310) —
 * GPS-surveyed acreage (from the plot boundary survey) is the preferred
 * source when available, more precise than the Excel-recorded `area_acres`
 * (`Field.area`), which itself is the fallback. Exported so Compare's
 * Stage Matrix area-weighting can share the same fallback instead of
 * reading `field.area` directly. */
export function areaFor(field: Field, geo: FieldGeo | undefined): number {
  if (geo?.gpsAcre != null && geo.gpsAcre > 0) return geo.gpsAcre
  const n = Number.parseFloat(field.area)
  return Number.isFinite(n) ? n : 0
}

/** Ports `pixelBreakdown()`/`pixBarHtml()` (RS_Cane_Monitoring_S1.html:
 * 4261-4289) — NOT the field-level health status these cards already
 * bucket by. Each field's OWN pixel-level Good/Moderate/Attention split
 * (`FieldGeo.pixelDist`, from the NDVI raster classification), weighted by
 * that field's own acreage and averaged across the group — a finer-grained
 * view than the tile's own status, since e.g. a "Good" field can still
 * have some attention-level pixels within it. Null when no field in the
 * group has pixel data loaded. */
function pixelBreakdown(fields: Field[], geoByCode: Record<string, FieldGeo>): PixelBreakdown | null {
  let acre = 0
  let g = 0
  let m = 0
  let a = 0
  let any = false
  for (const field of fields) {
    const geo = geoByCode[field.code]
    const ac = areaFor(field, geo)
    acre += ac
    const pd = geo?.pixelDist
    if (pd && pd.good + pd.optimal + pd.attention > 0) {
      any = true
      g += (ac * pd.good) / 100
      m += (ac * pd.optimal) / 100
      a += (ac * pd.attention) / 100
    }
  }
  if (!any || acre <= 0) return null
  return { goodPct: (g / acre) * 100, modPct: (m / acre) * 100, attnPct: (a / acre) * 100 }
}

export const DEFAULT_WATCH_THRESHOLD = 0.1

/** A Good/Moderate field with a significant recent NDVI drop — a separate
 * flag layered on top of health status, not a 6th classification bucket.
 * Ports the "Watch alert" card (RS_Cane_Monitoring_S1.html:797-817).
 * Exported so filterFields.ts can apply the "Watch" stat-card filter. */
export function isWatch(field: Field, geo: FieldGeo | undefined, threshold: number): boolean {
  if (!geo || geo.ndvi === null || geo.prevNdvi === null) return false
  if (field.healthStatus !== 'good' && field.healthStatus !== 'optimal') return false
  // Round before comparing, matching source's own `ndviDelta` rounding
  // (RS_Cane_Monitoring_S1.html:2757, `.toFixed(3)`) — without it, a drop
  // that's exactly 0.10 in real terms (e.g. 0.74 - 0.64) can come out as
  // 0.09999999999999998 in floating point, silently failing a strict
  // `>= threshold` check for a field that should clearly be flagged.
  const drop = Number((geo.prevNdvi - geo.ndvi).toFixed(3))
  return drop >= threshold
}

/** Ports `renderStats()` (RS_Cane_Monitoring_S1.html:4223+) — counts and
 * acreage per health-status bucket, plus the separate Watch flag. "Fields
 * monitored" counts only fields with a resolved health status (i.e. an
 * actual NDVI reading to grade), matching source's `latestPerField(data)`
 * scoping — a field with no observation yet has `healthStatus: 'unknown'`
 * and was never meant to inflate this total. */
export function computeFieldStats(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  watchThreshold: number = DEFAULT_WATCH_THRESHOLD,
): FieldStats {
  const monitored = fields.filter((f) => f.healthStatus !== 'unknown')
  const totalAcres = monitored.reduce((sum, f) => sum + areaFor(f, geoByCode[f.code]), 0)

  const make = (key: StatCardKey, label: string, matches: Field[]): StatBucket => ({
    key,
    label,
    count: matches.length,
    acres: matches.reduce((sum, f) => sum + areaFor(f, geoByCode[f.code]), 0),
    pixelBreakdown: pixelBreakdown(matches, geoByCode),
  })

  const good = fields.filter((f) => f.healthStatus === 'good')
  const optimal = fields.filter((f) => f.healthStatus === 'optimal')
  const attention = fields.filter((f) => f.healthStatus === 'attention')
  const serious = fields.filter((f) => f.healthStatus === 'serious')
  const watch = fields.filter((f) => isWatch(f, geoByCode[f.code], watchThreshold))

  return {
    totalCount: monitored.length,
    totalAcres,
    totalPixelBreakdown: pixelBreakdown(monitored, geoByCode),
    buckets: {
      good: make('good', 'Good', good),
      optimal: make('optimal', 'Moderate', optimal),
      attention: make('attention', 'Need Attention', attention),
      serious: make('serious', 'Need Serious Attention', serious),
      watch: make('watch', 'Watch', watch),
    },
  }
}
