import { classifyHistory, type ClassifiedObservation } from './classifyHistory'
import { stageForAge, stages, type GrowthStage } from './growthStage'
import { AGE_BUCKET_DAYS } from './plotTypeStyle'
import { seasonLabelForYear, seasonStartYearFor } from './season'
import type { Field, FieldGeo } from './types'

export type TrendTrack = 'health' | 'stage'

export interface TrendSeries {
  key: string
  label: string
  color: string
  counts: number[]
}

export interface HealthTrendResult {
  labels: string[]
  series: TrendSeries[]
  totals: number[]
}

const WINDOW_DAYS = 7
const DAY_MS = 86400000

/** Fortnightly snapshot points (15th of each month + month-end), between
 * start/end inclusive — ports genDatePoints()'s default `15_eom` mode
 * (RS_Cane_Monitoring_S1.html) rather than the other 3 configurable modes,
 * per the agreed fixed-defaults scope for this pass. */
export function genDatePoints(start: Date, end: Date): Date[] {
  const points: Date[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    const fifteenth = new Date(cursor.getFullYear(), cursor.getMonth(), 15)
    if (fifteenth >= start && fifteenth <= end) points.push(fifteenth)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    if (monthEnd >= start && monthEnd <= end) points.push(monthEnd)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  points.sort((a, b) => a.getTime() - b.getTime())
  return points
}

/** Nearest observation to `target` within `windowDays`, preferring a
 * confirmed (non-S1/low-confidence) row over an unconfirmed one at the
 * same or worse distance — ports `nearestObs()`'s confidence-aware
 * selection. */
export function nearestObs(
  rows: ClassifiedObservation[],
  target: Date,
  windowDays: number,
): ClassifiedObservation | null {
  const windowMs = windowDays * DAY_MS
  let bestConf: { row: ClassifiedObservation; diff: number } | null = null
  let bestAny: { row: ClassifiedObservation; diff: number } | null = null
  for (const row of rows) {
    const diff = Math.abs(row.date.getTime() - target.getTime())
    if (diff > windowMs) continue
    if (!bestAny || diff < bestAny.diff) bestAny = { row, diff }
    if (!row.isUnconfirmed && (!bestConf || diff < bestConf.diff)) bestConf = { row, diff }
  }
  return (bestConf ?? bestAny)?.row ?? null
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const HEALTH_CATS = [
  { key: 'good', label: 'Good', color: '#22a65a' },
  { key: 'optimal', label: 'Moderate', color: '#f59e0b' },
  { key: 'attention', label: 'Need Attention', color: '#dc2626' },
]

const STAGE_TREND_COLOR: Record<string, string> = {
  Germination: '#2563EB',
  'Early Tiller': '#DB2777',
  Tillering: '#0D9488',
  'Grand Growth': '#EA580C',
  Maturity: '#1F2937',
}

/** Ports `renderTrend()`'s core Count/% computation
 * (RS_Cane_Monitoring_S1.html:7054-7228) — for each snapshot date, the
 * count of fields in each health/stage category. The final point always
 * uses each field's true latest reading (already computed in `FieldGeo`,
 * no window cap) so it exactly matches the stat row's KPI counts, same
 * guarantee `trueLatestForField()` gives the source. */
export function computeHealthTrend(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  start: Date,
  end: Date,
  track: TrendTrack,
  stageResolver: (factoryCode: string, clientCode: string | null) => GrowthStage[] = () => stages,
): HealthTrendResult {
  const points = genDatePoints(start, end)
  if (points.length === 0) return { labels: [], series: [], totals: [] }

  const stagesByField = new Map<string, GrowthStage[]>()
  const historyByField = new Map<string, ClassifiedObservation[]>()
  for (const field of fields) {
    const resolved = stageResolver(field.factoryCode, field.clientCode)
    stagesByField.set(field.code, resolved)
    historyByField.set(field.code, classifyHistory(field, geoByCode[field.code], resolved))
  }

  const categoryKeys = track === 'health' ? HEALTH_CATS.map((c) => c.key) : stages.map((s) => s.name)
  const counts: Record<string, number[]> = {}
  categoryKeys.forEach((k) => (counts[k] = []))
  const seenExtra = new Set<string>()
  const labels: string[] = []
  const totals: number[] = []

  points.forEach((point, idx) => {
    const isLastPoint = idx === points.length - 1
    const tally: Record<string, number> = {}
    let counted = 0

    for (const field of fields) {
      const geo = geoByCode[field.code]
      let category: string | null = null

      if (isLastPoint) {
        if (track === 'health') {
          if (geo?.ndvi == null) continue
          category =
            geo.healthStatus === 'attention' || geo.healthStatus === 'serious' ? 'attention' : geo.healthStatus
        } else {
          if (!geo?.growthStage) continue
          category = geo.growthStage
        }
      } else {
        const nearest = nearestObs(historyByField.get(field.code) ?? [], point, WINDOW_DAYS)
        if (!nearest) continue
        if (track === 'health') {
          category = nearest.status === 'unknown' ? null : nearest.status
        } else {
          category = stageForAge(nearest.age, stagesByField.get(field.code))?.stage.name ?? null
        }
      }

      if (!category) continue
      counted++
      tally[category] = (tally[category] ?? 0) + 1
      if (!categoryKeys.includes(category)) seenExtra.add(category)
    }

    categoryKeys.forEach((k) => counts[k].push(tally[k] ?? 0))
    seenExtra.forEach((k) => {
      counts[k] ??= new Array(idx).fill(0)
      counts[k].push(tally[k] ?? 0)
    })
    totals.push(counted)
    labels.push(isLastPoint ? `${formatLabel(point)} (latest)` : formatLabel(point))
  })

  const keepIdx: number[] = []
  totals.forEach((t, i) => {
    if (t > 0) keepIdx.push(i)
  })

  const filteredLabels = keepIdx.map((i) => labels[i])
  const filteredTotals = keepIdx.map((i) => totals[i])

  const series: TrendSeries[] = [
    ...categoryKeys.map((k) => {
      const meta =
        track === 'health'
          ? HEALTH_CATS.find((c) => c.key === k)!
          : { label: k, color: STAGE_TREND_COLOR[k] ?? '#6b7280' }
      return { key: k, label: meta.label, color: meta.color, counts: keepIdx.map((i) => counts[k][i] ?? 0) }
    }),
    ...Array.from(seenExtra).map((k) => ({
      key: k,
      label: k,
      color: '#9ca3af',
      counts: keepIdx.map((i) => counts[k][i] ?? 0),
    })),
  ]

  return { labels: filteredLabels, series, totals: filteredTotals }
}

export interface YoYPoint {
  x: number
  count: number
  total: number
}

export interface YoYSeries {
  key: string
  label: string
  color: string
  dash: number[]
  points: YoYPoint[]
}

const YOY_DASH: number[][] = [[], [6, 4], [2, 3], [8, 3, 2, 3]]

/** Ports `renderTrendYoY()` (RS_Cane_Monitoring_S1.html:6988-7052) — aligns
 * selected seasons by Days After Planting instead of calendar date, one
 * Good/Moderate/Need-Attention line per season (dash pattern distinguishes
 * seasons; color still encodes the health category). Health-status only —
 * "Crop stage YoY isn't meaningful the same way, since stage composition
 * by DAP is already roughly fixed by the threshold config" per the source's
 * own comment. Reuses each field's already-computed latest reading
 * (`FieldGeo.healthStatus`/`growthDays`) rather than re-deriving per-
 * observation history, since YoY only ever looks at each field's current
 * status grouped by which season it was planted in. */
export function computeHealthTrendYoY(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  seasonYears: number[],
): YoYSeries[] {
  const sortedYears = [...seasonYears].sort((a, b) => a - b)
  const series: YoYSeries[] = []

  sortedYears.forEach((year, sIdx) => {
    const seasonFields = fields.filter((f) => seasonStartYearFor(f.plantDateRaw) === year)
    const buckets: Record<number, { good: number; optimal: number; attention: number; total: number }> = {}

    for (const field of seasonFields) {
      const geo = geoByCode[field.code]
      if (!geo || geo.ndvi == null || geo.growthDays == null) continue
      const cat = geo.healthStatus === 'attention' || geo.healthStatus === 'serious' ? 'attention' : geo.healthStatus
      if (cat !== 'good' && cat !== 'optimal' && cat !== 'attention') continue
      const b = Math.floor(geo.growthDays / AGE_BUCKET_DAYS)
      buckets[b] ??= { good: 0, optimal: 0, attention: 0, total: 0 }
      buckets[b][cat]++
      buckets[b].total++
    }

    const bucketKeys = Object.keys(buckets)
      .map(Number)
      .sort((a, b) => a - b)
    const seasonLabel = seasonLabelForYear(year)

    HEALTH_CATS.forEach((c) => {
      series.push({
        key: `${year}-${c.key}`,
        label: `${seasonLabel} — ${c.label}`,
        color: c.color,
        dash: YOY_DASH[sIdx % YOY_DASH.length],
        points: bucketKeys.map((b) => ({
          x: b * AGE_BUCKET_DAYS + AGE_BUCKET_DAYS / 2,
          count: buckets[b][c.key as 'good' | 'optimal' | 'attention'],
          total: buckets[b].total,
        })),
      })
    })
  })

  return series
}
