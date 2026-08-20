import type { ScoutData } from '../scout/types'
import { computePlotScores, topBottomPlots, type PlotScore } from './aiInsights'
import { classifyHistory } from './classifyHistory'
import { areaFor, computeFieldStats } from './computeFieldStats'
import { computeHealthTrend, nearestObs, type HealthTrendResult } from './healthTrend'
import { scoreForNdvi, stageForAge, stages, type GrowthStage } from './growthStage'

type StageResolver = (factoryCode: string, clientCode: string | null) => GrowthStage[]
import {
  computeScoutReasons,
  computeScoutStatus,
  SCOUT_REASON_CATEGORIES,
  SCOUT_STATUSES,
  type ScoutStatus,
} from './scoutAnalytics'
import type { Field, FieldGeo } from './types'

const FORTNIGHT_DAYS = 14
const SNAPSHOT_WINDOW_DAYS = 7
/** Below this fraction of the current period's monitored-field count, a
 * historical snapshot is treated as too sparse to compare against — a new
 * client/factory with little history two fortnights ago would otherwise
 * produce a misleading "went from 2 fields to 40" comparison. */
const MIN_COMPARABLE_COVERAGE = 0.5

export interface DivisionRankingEntry {
  division: string
  avgScore: number
  fieldCount: number
  acres: number
  goodPct: number
  moderatePct: number
  attentionPct: number
  unattended: number
  overdue: number
  closed: number
}

export interface ReasonTally {
  category: string
  count: number
}

export interface DivisionMover {
  division: string
  delta: number
}

export interface FortnightComparison {
  /** False when the previous fortnight has too little dated history to
   * compare against (e.g. a factory only recently onboarded) — the UI
   * should show a plain "not enough history yet" note instead of the
   * delta figures in that case. */
  comparable: boolean
  previousLabel: string
  goodPctDelta: number
  moderatePctDelta: number
  attentionPctDelta: number
  divisionMovers: DivisionMover[]
  narrative: string
}

export interface ExecutiveReportData {
  factory: string
  periodLabel: string
  generatedOn: Date
  totalFields: number
  totalAcres: number
  good: { count: number; acres: number }
  moderate: { count: number; acres: number }
  attention: { count: number; acres: number }
  healthTrend: HealthTrendResult
  scoutStatusCounts: Record<ScoutStatus, number>
  topReasons: ReasonTally[]
  divisionRanking: DivisionRankingEntry[]
  topPlots: PlotScore[]
  bottomPlots: PlotScore[]
  summary: string
  comparison: FortnightComparison
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

/** Every division present among the given fields, ranked by average
 * per-plot score (`scoreForNdvi`, growthStage.ts) — the same headline
 * score already used by AI Insights' Farmer Performance / Top-Bottom
 * Plots, just grouped by division instead of farmer here. */
function computeDivisionRanking(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutStatusByDivision: Record<string, Record<string, number>>,
): DivisionRankingEntry[] {
  const plotScores = computePlotScores(fields, geoByCode)
  const scoreByCode = new Map(plotScores.map((p) => [p.field.code, p.score]))

  const byDivision = new Map<string, Field[]>()
  for (const f of fields) {
    const key = f.division || 'Unknown'
    if (!byDivision.has(key)) byDivision.set(key, [])
    byDivision.get(key)!.push(f)
  }

  const entries: DivisionRankingEntry[] = []
  for (const [division, divFields] of byDivision) {
    const scored = divFields.map((f) => scoreByCode.get(f.code)).filter((s): s is number => s != null)
    if (scored.length === 0) continue
    const avgScore = scored.reduce((s, v) => s + v, 0) / scored.length
    const acres = divFields.reduce((s, f) => s + areaFor(f, geoByCode[f.code]), 0)
    const good = divFields.filter((f) => f.healthStatus === 'good').length
    const moderate = divFields.filter((f) => f.healthStatus === 'optimal').length
    const attention = divFields.filter((f) => f.healthStatus === 'attention' || f.healthStatus === 'serious').length
    const monitored = good + moderate + attention
    const statusBucket = scoutStatusByDivision[division]
    entries.push({
      division,
      avgScore,
      fieldCount: divFields.length,
      acres,
      goodPct: pct(good, monitored),
      moderatePct: pct(moderate, monitored),
      attentionPct: pct(attention, monitored),
      unattended: statusBucket?.Unattended ?? 0,
      overdue: statusBucket?.Overdue ?? 0,
      closed: statusBucket?.Closed ?? 0,
    })
  }

  return entries.sort((a, b) => b.avgScore - a.avgScore)
}

interface HistoricalSnapshot {
  good: number
  moderate: number
  attention: number
  monitored: number
  divisionAvgScore: Map<string, number>
}

/** Reconstructs field health as it stood on `targetDate` from each field's
 * own dated history (`classifyHistory` + `nearestObs`, the same
 * confidence-aware nearest-reading lookup `computeHealthTrend` already uses
 * per snapshot point) — `FieldGeo.healthStatus`/`ndvi` only ever hold each
 * field's CURRENT state, so a genuine "two fortnights ago" comparison has
 * no other data source to read from. */
function snapshotAsOf(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  targetDate: Date,
  stageResolver: StageResolver,
): HistoricalSnapshot {
  let good = 0
  let moderate = 0
  let attention = 0
  const scoresByDivision = new Map<string, number[]>()

  for (const field of fields) {
    const geo = geoByCode[field.code]
    if (!geo) continue
    const fieldStages = stageResolver(field.factoryCode, field.clientCode)
    const rows = classifyHistory(field, geo, fieldStages)
    const nearest = nearestObs(rows, targetDate, SNAPSHOT_WINDOW_DAYS)
    if (!nearest || nearest.status === 'unknown') continue

    if (nearest.status === 'good') good++
    else if (nearest.status === 'optimal') moderate++
    else if (nearest.status === 'attention') attention++

    const stageInfo = stageForAge(nearest.age, fieldStages)
    if (stageInfo) {
      const division = field.division || 'Unknown'
      const list = scoresByDivision.get(division) ?? []
      list.push(scoreForNdvi(nearest.ndvi, stageInfo.stage))
      scoresByDivision.set(division, list)
    }
  }

  const divisionAvgScore = new Map<string, number>()
  for (const [division, scores] of scoresByDivision) {
    divisionAvgScore.set(division, scores.reduce((s, v) => s + v, 0) / scores.length)
  }

  return { good, moderate, attention, monitored: good + moderate + attention, divisionAvgScore }
}

function trendWord(delta: number, betterWhenNegative: boolean): string {
  const sign = betterWhenNegative ? -delta : delta
  if (sign >= 1) return 'improved'
  if (sign <= -1) return 'declined'
  return 'held steady'
}

function fmtPts(n: number): string {
  return `${n >= 0 ? '+' : ''}${n} pt${Math.abs(n) === 1 ? '' : 's'}`
}

/** Compares the current period against a snapshot ~2 weeks earlier —
 * "current" reads from the already-computed (spike-guard-escalated)
 * `good`/`moderate`/`attention` buckets so this stays consistent with the
 * KPI tiles shown right above it; only the PREVIOUS side needs the
 * historical `snapshotAsOf()` reconstruction, since there's no other way
 * to know what a field's status was two fortnights ago. */
function buildComparison(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  trendEnd: Date,
  good: { count: number },
  moderate: { count: number },
  attention: { count: number },
  divisionRanking: DivisionRankingEntry[],
  stageResolver: StageResolver,
): FortnightComparison {
  const previousDate = new Date(trendEnd.getTime() - FORTNIGHT_DAYS * 86400000)
  const previousLabel = `Fortnight ending ${fmtDate(previousDate)}`
  const previous = snapshotAsOf(fields, geoByCode, previousDate, stageResolver)

  const currentMonitored = good.count + moderate.count + attention.count
  const notComparable = currentMonitored === 0 || previous.monitored < currentMonitored * MIN_COMPARABLE_COVERAGE

  if (notComparable) {
    return {
      comparable: false,
      previousLabel,
      goodPctDelta: 0,
      moderatePctDelta: 0,
      attentionPctDelta: 0,
      divisionMovers: [],
      narrative: 'Not enough dated history two fortnights back to compare yet — this will fill in as more satellite passes accumulate.',
    }
  }

  const goodPctDelta = pct(good.count, currentMonitored) - pct(previous.good, previous.monitored)
  const moderatePctDelta = pct(moderate.count, currentMonitored) - pct(previous.moderate, previous.monitored)
  const attentionPctDelta = pct(attention.count, currentMonitored) - pct(previous.attention, previous.monitored)

  const divisionMovers: DivisionMover[] = []
  for (const d of divisionRanking) {
    const prevScore = previous.divisionAvgScore.get(d.division)
    if (prevScore == null) continue
    divisionMovers.push({ division: d.division, delta: Math.round(d.avgScore - prevScore) })
  }
  divisionMovers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const overall = trendWord(attentionPctDelta, true)
  const parts: string[] = []
  parts.push(
    `Compared to the previous fortnight (${previousLabel}), Good ${fmtPts(goodPctDelta)}, Moderate ${fmtPts(moderatePctDelta)}, and Need Attention ${fmtPts(attentionPctDelta)} — overall health has ${overall}.`,
  )
  const improved = [...divisionMovers].filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta)[0]
  const declined = [...divisionMovers].filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta)[0]
  if (improved || declined) {
    const bits: string[] = []
    if (improved) bits.push(`${improved.division} improved the most (${fmtPts(improved.delta)} score)`)
    if (declined) bits.push(`${declined.division} declined the most (${fmtPts(declined.delta)} score)`)
    parts.push(`Division movement: ${bits.join('; ')}.`)
  } else {
    parts.push('Division scores were broadly unchanged from the previous fortnight.')
  }

  return {
    comparable: true,
    previousLabel,
    goodPctDelta,
    moderatePctDelta,
    attentionPctDelta,
    divisionMovers,
    narrative: parts.join(' '),
  }
}

function buildSummary(
  factory: string,
  periodLabel: string,
  totalFields: number,
  totalAcres: number,
  good: { count: number; acres: number },
  moderate: { count: number; acres: number },
  attention: { count: number; acres: number },
  scoutStatusCounts: Record<ScoutStatus, number>,
  topReasons: ReasonTally[],
  divisionRanking: DivisionRankingEntry[],
): string {
  const monitored = good.count + moderate.count + attention.count
  const goodPct = pct(good.count, monitored)
  const modPct = pct(moderate.count, monitored)
  const attnPct = pct(attention.count, monitored)
  const scouted = scoutStatusCounts.Scouted + scoutStatusCounts.Closed + scoutStatusCounts.Overdue
  const scoutedPct = pct(scouted, totalFields)
  const topReason = topReasons[0]?.category
  const best = divisionRanking[0]
  const worst = divisionRanking[divisionRanking.length - 1]

  const parts: string[] = []
  parts.push(
    `${factory} — ${periodLabel}: ${totalFields} monitored fields across ${divisionRanking.length} division${divisionRanking.length === 1 ? '' : 's'}, covering ${totalAcres.toFixed(0)} acres.`,
  )
  parts.push(
    `${goodPct}% of acreage is Good, ${modPct}% Moderate, and ${attnPct}% needs attention (${attention.acres.toFixed(0)} ac).`,
  )
  if (totalFields > 0) {
    parts.push(
      `Scout coverage stands at ${scoutedPct}% for this period${topReason ? `; the most common flagged issue is ${topReason}` : ''}.`,
    )
  }
  if (best && worst && best.division !== worst.division) {
    parts.push(
      `${best.division} division leads with an average score of ${best.avgScore.toFixed(0)}, while ${worst.division} needs the most support at ${worst.avgScore.toFixed(0)}.`,
    )
  }
  return parts.join(' ')
}

/** One-page-per-factory snapshot for executive review — combines
 * already-built computations (health trend, scout status/reasons, plot
 * scoring) rather than re-deriving any of them, so this stays consistent
 * with what the Health Trend / Scout Analytics / AI Insights tabs already
 * show for the same fields. `trendStart`/`trendEnd` control the Health
 * Trend graph's window; `genDatePoints` inside `computeHealthTrend` already
 * samples fortnightly (15th + month-end), matching the requested cadence
 * with no extra work needed here. */
export function computeExecutiveReport(
  factory: string,
  allFields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  trendStart: Date,
  trendEnd: Date,
  stageResolver: StageResolver = () => stages,
): ExecutiveReportData {
  const fields = allFields.filter((f) => f.factory === factory)

  const stats = computeFieldStats(fields, geoByCode)
  const good = { count: stats.buckets.good.count, acres: stats.buckets.good.acres }
  const moderate = { count: stats.buckets.optimal.count, acres: stats.buckets.optimal.acres }
  const attention = {
    count: stats.buckets.attention.count + stats.buckets.serious.count,
    acres: stats.buckets.attention.acres + stats.buckets.serious.acres,
  }

  const healthTrend = computeHealthTrend(fields, geoByCode, trendStart, trendEnd, 'health', stageResolver)

  const scoutStatusCounts: Record<ScoutStatus, number> = {
    Unattended: 0,
    Scouted: 0,
    Overdue: 0,
    Closed: 0,
    'Watch Worst': 0,
  }
  const statusResult = computeScoutStatus(fields, geoByCode, 'division', scoutData, stageResolver)
  for (const group of statusResult.groupNames) {
    for (const status of SCOUT_STATUSES) {
      scoutStatusCounts[status] += statusResult.buckets[group]?.[status] ?? 0
    }
  }

  const reasonsResult = computeScoutReasons(fields, geoByCode, 'factory', scoutData)
  const reasonTotals: Record<string, number> = Object.fromEntries(SCOUT_REASON_CATEGORIES.map((c) => [c, 0]))
  for (const group of reasonsResult.groupNames) {
    for (const cat of SCOUT_REASON_CATEGORIES) {
      reasonTotals[cat] += reasonsResult.buckets[group]?.[cat] ?? 0
    }
  }
  const topReasons = SCOUT_REASON_CATEGORIES.map((category) => ({ category, count: reasonTotals[category] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const divisionRanking = computeDivisionRanking(fields, geoByCode, statusResult.buckets)
  const plotScores = computePlotScores(fields, geoByCode)
  const { top: topPlots, bottom: bottomPlots } = topBottomPlots(plotScores, 10)

  const periodLabel = `Fortnight ending ${fmtDate(trendEnd)}`
  const summary = buildSummary(
    factory,
    periodLabel,
    fields.length,
    stats.totalAcres,
    good,
    moderate,
    attention,
    scoutStatusCounts,
    topReasons,
    divisionRanking,
  )
  const comparison = buildComparison(fields, geoByCode, trendEnd, good, moderate, attention, divisionRanking, stageResolver)

  return {
    factory,
    periodLabel,
    generatedOn: new Date(),
    totalFields: fields.length,
    totalAcres: stats.totalAcres,
    good,
    moderate,
    attention,
    healthTrend,
    scoutStatusCounts,
    topReasons,
    divisionRanking,
    topPlots,
    bottomPlots,
    summary,
    comparison,
  }
}

/** Distinct factory names present in the given fields, sorted — used to
 * populate the report's factory picker. Kept here (not read straight off
 * `field.factory` inline in the view) so future dedupe/normalization only
 * needs one place to change. */
export function factoriesIn(fields: Field[]): string[] {
  return [...new Set(fields.map((f) => f.factory).filter(Boolean))].sort()
}
