import { classifyHistory, type ClassifiedObservation } from './classifyHistory'
import { areaFor } from './computeFieldStats'
import { stageForAge, stages, type GrowthStage } from './growthStage'

type StageResolver = (factoryCode: string, clientCode: string | null) => GrowthStage[]
const defaultStageResolver: StageResolver = () => stages
import { orderPlotTypes } from './plotTypeStyle'
import { seasonLabelForYear, seasonStartYearFor } from './season'
import type { Field, FieldGeo } from './types'

export type CompareGroupKey = 'client' | 'factory' | 'division' | 'section' | 'farmer' | 'plotType' | 'stage' | 'variety'

export const COMPARE_GROUP_LABEL: Record<CompareGroupKey, string> = {
  client: 'Client',
  factory: 'Factory / Mill',
  division: 'Division',
  section: 'Section',
  farmer: 'Farmer',
  plotType: 'Crop Type',
  stage: 'Crop stage',
  variety: 'Variety',
}

const WATCH_THRESHOLD = 0.1

/** Ports the group-value extraction implicit in `renderCompare()`'s
 * `r[groupKey]` lookups (:7576) — 'stage' needs the field's current growth
 * stage from FieldGeo since Field itself doesn't carry it. **Client and
 * Factory/Mill are separate levels of the hierarchy** (Client > Factory >
 * Division > Section > Village > Farmer > Plot) and must stay separate
 * group-by dimensions — an earlier version conflated them under one
 * "Mill / Client" button keyed on `clientCode` alone, which meant picking
 * a Client in the sidebar and grouping by it collapsed every one of that
 * client's factories into a single bar instead of breaking them out. */
export function groupValueFor(field: Field, geoByCode: Record<string, FieldGeo>, key: CompareGroupKey): string {
  switch (key) {
    case 'client':
      return field.clientCode || 'Unknown'
    case 'factory':
      return field.factory || 'Unknown'
    case 'division':
      return field.division || 'Unknown'
    case 'section':
      return field.section || 'Unknown'
    case 'farmer':
      return field.name || 'Unknown'
    case 'plotType':
      return field.type || 'Unknown'
    case 'stage':
      return geoByCode[field.code]?.growthStage || 'Unknown'
    case 'variety':
      return field.variety || 'Unknown'
  }
}

/** Ports the group-ordering rules (:7586-7603) — natural stage/plot-type
 * order, else descending by whatever `totalFor` reports (biggest group
 * first). */
export function orderGroupNames(key: CompareGroupKey, names: string[], totalFor: (name: string) => number): string[] {
  if (key === 'stage') {
    const stageOrder = stages.map((s) => s.name)
    return stageOrder.filter((s) => names.includes(s)).concat(names.filter((s) => !stageOrder.includes(s)).sort())
  }
  if (key === 'plotType') {
    return orderPlotTypes(names)
  }
  return [...names].sort((a, b) => totalFor(b) - totalFor(a))
}

/** Among a field's classified history rows, the latest one whose date
 * falls within [start,end] (preferring a confirmed reading over an
 * unconfirmed one at the same or worse recency), plus whichever row
 * immediately precedes it in the field's full chronological history (for
 * Watch-drop detection) — ports the "filter to period, then latestPerField"
 * two-step (renderCompare() :7476, :7490) properly, rather than each
 * field's true/unbounded latest. */
export function latestInPeriod(
  rows: ClassifiedObservation[],
  start: Date,
  end: Date,
): { observation: ClassifiedObservation; prev: ClassifiedObservation | null } | null {
  let bestConfIdx = -1
  let bestAnyIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.date < start || r.date > end) continue
    if (bestAnyIdx === -1 || r.date > rows[bestAnyIdx].date) bestAnyIdx = i
    if (!r.isUnconfirmed && (bestConfIdx === -1 || r.date > rows[bestConfIdx].date)) bestConfIdx = i
  }
  const idx = bestConfIdx !== -1 ? bestConfIdx : bestAnyIdx
  if (idx === -1) return null
  return { observation: rows[idx], prev: idx > 0 ? rows[idx - 1] : null }
}

export interface CompareBucket {
  good: number
  optimal: number
  attention: number
  watch: number
  total: number
}

export interface CompareCountsResult {
  groupNames: string[]
  buckets: Record<string, CompareBucket>
}

/** Ports `renderCompare()`'s Count/% mode (:7569-7621) — each field's
 * latest-within-period reading, tallied by group. */
export function computeCompareCounts(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: CompareGroupKey,
  start: Date,
  end: Date,
  stageResolver: StageResolver = defaultStageResolver,
): CompareCountsResult {
  const buckets: Record<string, CompareBucket> = {}

  for (const field of fields) {
    const geo = geoByCode[field.code]
    const rows = classifyHistory(field, geo, stageResolver(field.factoryCode, field.clientCode))
    const result = latestInPeriod(rows, start, end)
    if (!result) continue
    const { observation, prev } = result
    const status = observation.status
    if (status !== 'good' && status !== 'optimal' && status !== 'attention') continue

    const group = groupValueFor(field, geoByCode, groupKey)
    buckets[group] ??= { good: 0, optimal: 0, attention: 0, watch: 0, total: 0 }
    buckets[group][status]++
    buckets[group].total++

    if (
      (status === 'good' || status === 'optimal') &&
      prev &&
      // Round before comparing — see isWatch()'s docstring in
      // computeFieldStats.ts for why an unrounded floating-point
      // subtraction can silently fail an exact-threshold comparison.
      Number((prev.ndvi - observation.ndvi).toFixed(3)) >= WATCH_THRESHOLD
    ) {
      buckets[group].watch++
    }
  }

  const groupNames = orderGroupNames(groupKey, Object.keys(buckets), (n) => buckets[n]?.total ?? 0)
  return { groupNames, buckets }
}

interface StageCell {
  good: number
  moderate: number
  attention: number
  total: number
  ndviSum: number
  goodAc: number
  moderateAc: number
  attentionAc: number
  totalAc: number
}

export interface StageMatrixResult {
  groupNames: string[]
  stageNames: string[]
  cells: Record<string, Record<string, StageCell>>
  scores: Record<string, number | null>
  meta: Record<string, { division: string; village: string }>
}

/** Ports `renderCompareStageMatrix()` (:7288-7460) — tallies EVERY in-period
 * observation (not just latest) per (group, stage-at-that-observation)
 * cell, area-weighted via `areaFor()` (GPS-surveyed acreage, falling back
 * to `field.area` when no boundary survey exists — same fallback source
 * uses), plus the per-group Score: average,
 * across every stage the group has data for, of (that stage's avg NDVI /
 * that stage's optimal midpoint) x 100, each stage's contribution capped at
 * (stage max / midpoint) x 100 so one outlier stage can't inflate the
 * whole score. */
export function computeCompareStageMatrix(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: CompareGroupKey,
  start: Date,
  end: Date,
  stageResolver: StageResolver = defaultStageResolver,
): StageMatrixResult {
  const cells: Record<string, Record<string, StageCell>> = {}
  const meta: Record<string, { division: string; village: string }> = {}

  for (const field of fields) {
    const geo = geoByCode[field.code]
    const fieldStages = stageResolver(field.factoryCode, field.clientCode)
    const rows = classifyHistory(field, geo, fieldStages)
    const group = groupValueFor(field, geoByCode, groupKey)
    meta[group] ??= { division: field.division, village: field.village }
    const areaAc = areaFor(field, geo)

    for (const row of rows) {
      if (row.date < start || row.date > end) continue
      if (row.status === 'unknown') continue
      const sf = stageForAge(row.age, fieldStages)
      if (!sf) continue

      cells[group] ??= {}
      cells[group][sf.stage.name] ??= {
        good: 0,
        moderate: 0,
        attention: 0,
        total: 0,
        ndviSum: 0,
        goodAc: 0,
        moderateAc: 0,
        attentionAc: 0,
        totalAc: 0,
      }
      const cell = cells[group][sf.stage.name]
      cell.total++
      cell.ndviSum += row.ndvi
      cell.totalAc += areaAc
      if (row.status === 'good') {
        cell.good++
        cell.goodAc += areaAc
      } else if (row.status === 'optimal') {
        cell.moderate++
        cell.moderateAc += areaAc
      } else {
        cell.attention++
        cell.attentionAc += areaAc
      }
    }
  }

  // Score math below deliberately still uses the global default `stages`
  // (not a per-field resolved table) — a single "group" here (e.g. by
  // client or variety) can span multiple factories with different
  // thresholds, so there's no one field's table that's uniquely "correct"
  // for an aggregate score across the whole group. The per-field/per-row
  // classification above (good/moderate/attention counts and acreage) is
  // already fully correct per client/factory; only this aggregate scoring
  // step keeps using the shared reference thresholds.
  const scores: Record<string, number | null> = {}
  for (const group of Object.keys(cells)) {
    let sumScores = 0
    let nStages = 0
    for (const stage of stages) {
      const cell = cells[group][stage.name]
      if (!cell || cell.total === 0) continue
      const mid = (stage.tMin + stage.tMax) / 2
      if (!mid) continue
      const avgNdvi = cell.ndviSum / cell.total
      const cap = (stage.tMax / mid) * 100
      const stageScore = Math.min((avgNdvi / mid) * 100, cap)
      sumScores += stageScore
      nStages++
    }
    scores[group] = nStages ? sumScores / nStages : null
  }

  const totalFor = (g: string) => Object.values(cells[g] ?? {}).reduce((s, c) => s + c.total, 0)
  const groupNames = orderGroupNames(groupKey, Object.keys(cells), totalFor)

  return { groupNames, stageNames: stages.map((s) => s.name), cells, scores, meta }
}

export interface CompareYoYResult {
  groupNames: string[]
  seasonLabels: string[]
  cells: Record<string, Record<string, CompareBucket>>
}

/** Ports `renderCompare()`'s YoY branch (:7501-7539) — same period-filtered
 * latest-per-field data as Count/%/Matrix (the source scopes `latestArr`
 * to the period *before* branching on view mode), cross-tabulated by
 * planting season instead of just by group. */
export function computeCompareYoY(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: CompareGroupKey,
  start: Date,
  end: Date,
  seasonYears: number[],
  stageResolver: StageResolver = defaultStageResolver,
): CompareYoYResult {
  const sortedYears = [...seasonYears].sort((a, b) => a - b)
  const seasonSet = new Set(sortedYears)
  const cells: Record<string, Record<string, CompareBucket>> = {}

  for (const field of fields) {
    const sy = seasonStartYearFor(field.plantDateRaw)
    if (sy === null || !seasonSet.has(sy)) continue

    const geo = geoByCode[field.code]
    const rows = classifyHistory(field, geo, stageResolver(field.factoryCode, field.clientCode))
    const result = latestInPeriod(rows, start, end)
    if (!result) continue
    const { observation, prev } = result
    const status = observation.status
    if (status !== 'good' && status !== 'optimal' && status !== 'attention') continue

    const group = groupValueFor(field, geoByCode, groupKey)
    const seasonLabel = seasonLabelForYear(sy)
    cells[group] ??= {}
    cells[group][seasonLabel] ??= { good: 0, optimal: 0, attention: 0, watch: 0, total: 0 }
    const cell = cells[group][seasonLabel]
    cell[status]++
    cell.total++
    if (
      (status === 'good' || status === 'optimal') &&
      prev &&
      // Round before comparing — see isWatch()'s docstring in
      // computeFieldStats.ts for why an unrounded floating-point
      // subtraction can silently fail an exact-threshold comparison.
      Number((prev.ndvi - observation.ndvi).toFixed(3)) >= WATCH_THRESHOLD
    ) {
      cell.watch++
    }
  }

  const totalFor = (g: string) => Object.values(cells[g] ?? {}).reduce((s, c) => s + c.total, 0)
  const groupNames = orderGroupNames(groupKey, Object.keys(cells), totalFor)
  const seasonLabels = sortedYears.map(seasonLabelForYear)

  return { groupNames, seasonLabels, cells }
}
