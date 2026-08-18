import { areaFor } from './computeFieldStats'
import { isFlagged, latestReport, scoutStatusForPlot, SCOUT_REASON_CATEGORIES, type ChecklistEntry } from './scoutAnalytics'
import type { Field, FieldGeo } from './types'
import type { ScoutData } from '../scout/types'

/** Ports source's Overview / Executive Summary tab (RS_Cane_Monitoring_S1.html
 * `renderOverview()` + helpers, :3754-4140) — the primary landing page in
 * source (styled as the sidebar's main CTA button, above every other tab),
 * never ported until now. Groups by Client / Factory-Mill / Division (a
 * three-level hierarchy, same Client-vs-Factory split already established
 * in compare.ts's CompareGroupKey — Client and Factory/Mill are never
 * conflated), with a two-step Client→Factory/Mill→Division drill-down. */

export type OverviewGroupKey = 'client' | 'factory' | 'division'

export function overviewGroupValue(field: Field, key: OverviewGroupKey): string {
  if (key === 'division') return field.division || 'Unknown'
  if (key === 'factory') return field.factory || 'Unknown'
  return field.clientCode || 'Unknown'
}

// ---------------------------------------------------------------------------
// Section 1 — Mapped Status
// ---------------------------------------------------------------------------

export interface PlotCoverage {
  total: number
  mapped: number
  notMapped: number
}

export function computePlotCoverage(fields: Field[]): PlotCoverage {
  const mapped = fields.filter((f) => f.mapped).length
  return { total: fields.length, mapped, notMapped: fields.length - mapped }
}

// ---------------------------------------------------------------------------
// Section 2 — Crop Health
// ---------------------------------------------------------------------------

export interface OverviewHealth {
  total: number
  good: number
  moderate: number
  attention: number
  serious: number
}

/** "Monitored" fields only (an actual NDVI reading to grade) — matches
 * `computeFieldStats.ts`'s own scoping, source's `latestPerField(filteredRows)`. */
export function computeOverviewHealth(fields: Field[]): OverviewHealth {
  const monitored = fields.filter((f) => f.healthStatus !== 'unknown')
  return {
    total: monitored.length,
    good: monitored.filter((f) => f.healthStatus === 'good').length,
    moderate: monitored.filter((f) => f.healthStatus === 'optimal').length,
    attention: monitored.filter((f) => f.healthStatus === 'attention').length,
    serious: monitored.filter((f) => f.healthStatus === 'serious').length,
  }
}

// ---------------------------------------------------------------------------
// Section 3 — Scout & Follow-up Tracking: headline KPIs + relevant-plots
// status table (only Need Attention/Serious, or already scouted — NOT
// every plot, unlike the Scout Analytics tab's own Scout Status view).
// ---------------------------------------------------------------------------

export interface ScoutTrackingKPIs {
  needAttention: number
  totalScouted: number
  uniquePlotsScouted: number
  scoutedThisWeek: number
  followUpDue: number
  overdue: number
}

const DAY_MS = 86400000

export function computeScoutTrackingKPIs(fields: Field[], scoutData: ScoutData): ScoutTrackingKPIs {
  const today = new Date()
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS)

  const plotCodes = new Set(fields.map((f) => f.code))
  const allScouts = fields.flatMap((f) => scoutData.reportsByPlot[f.code] ?? [])
  const uniquePlotsScouted = fields.filter((f) => (scoutData.reportsByPlot[f.code]?.length ?? 0) > 0).length
  const needAttention = fields.filter((f) => f.healthStatus === 'attention' || f.healthStatus === 'serious').length

  let scoutedThisWeek = 0
  let followUpDue = 0
  let overdue = 0
  for (const r of allScouts) {
    if (!plotCodes.has(r.plotNo)) continue
    if (r.visitDate >= weekAgo) scoutedThisWeek++
    if (r.followUpRequired && r.followUpDate) {
      if (r.followUpDate < today) overdue++
      else followUpDue++
    }
  }

  return { needAttention, totalScouted: allScouts.length, uniquePlotsScouted, scoutedThisWeek, followUpDue, overdue }
}

export interface RelevantScoutStatusResult {
  groupNames: string[]
  buckets: Record<
    string,
    { Unattended: number; Scouted: number; Overdue: number; Closed: number; 'Watch Worst': number; total: number }
  >
}

export function computeRelevantScoutStatus(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  groupKey: OverviewGroupKey,
): RelevantScoutStatusResult {
  const buckets: RelevantScoutStatusResult['buckets'] = {}

  for (const field of fields) {
    const isRelevant =
      field.healthStatus === 'attention' ||
      field.healthStatus === 'serious' ||
      (scoutData.reportsByPlot[field.code]?.length ?? 0) > 0
    if (!isRelevant) continue

    const group = overviewGroupValue(field, groupKey)
    buckets[group] ??= { Unattended: 0, Scouted: 0, Overdue: 0, Closed: 0, 'Watch Worst': 0, total: 0 }
    const status = scoutStatusForPlot(scoutData, field.code, geoByCode[field.code], field.plantDateRaw)
    buckets[group][status]++
    buckets[group].total++
  }

  const groupNames = Object.keys(buckets).sort((a, b) => buckets[b].total - buckets[a].total)
  return { groupNames, buckets }
}

// ---------------------------------------------------------------------------
// Section 4 — Reasons for Poor Crop Health: grouped table, latest scout
// visit per plot, percentages normalized PER ROW (each row's flagged
// categories sum to 100%) rather than per column.
// ---------------------------------------------------------------------------

export interface ReasonRow {
  group: string
  totalReports: number
  counts: Record<string, number>
}

export function computeOverviewReasons(fields: Field[], scoutData: ScoutData, groupKey: OverviewGroupKey): ReasonRow[] {
  const groups: Record<string, { field: Field }[]> = {}

  for (const field of fields) {
    const report = latestReport(scoutData, field.code)
    if (!report) continue
    const group = overviewGroupValue(field, groupKey)
    ;(groups[group] ??= []).push({ field })
  }

  const rows: ReasonRow[] = Object.keys(groups)
    .sort()
    .map((group) => {
      const entries = groups[group]
      const counts: Record<string, number> = {}
      for (const cat of SCOUT_REASON_CATEGORIES) counts[cat] = 0
      for (const { field } of entries) {
        const report = latestReport(scoutData, field.code)!
        for (const cat of SCOUT_REASON_CATEGORIES) {
          const entry = report.checklist[cat] as ChecklistEntry | undefined
          if (isFlagged(entry)) counts[cat]++
        }
      }
      return { group, totalReports: entries.length, counts }
    })

  return rows
}

// ---------------------------------------------------------------------------
// Section 5 — Follow-up Crop Status, AREA-weighted (acres, not just plot
// count) — a handful of large plots doing badly matters more than the same
// count of small ones.
// ---------------------------------------------------------------------------

export const OVERVIEW_FOLLOWUP_OUTCOMES = ['Improved', 'Same-Status', 'Still-Worst'] as const

export interface FollowupAreaCell {
  plots: number
  area: number
}

export interface FollowupAreaRow {
  group: string
  cells: Record<(typeof OVERVIEW_FOLLOWUP_OUTCOMES)[number], FollowupAreaCell>
}

export function computeOverviewFollowupByArea(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  groupKey: OverviewGroupKey,
): FollowupAreaRow[] {
  const groupByPlot = new Map<string, string>()
  const areaByPlot = new Map<string, number>()
  for (const field of fields) {
    groupByPlot.set(field.code, overviewGroupValue(field, groupKey))
    areaByPlot.set(field.code, areaFor(field, geoByCode[field.code]))
  }

  const plotByReportId = new Map<string, string>()
  for (const [plotCode, reports] of Object.entries(scoutData.reportsByPlot)) {
    for (const r of reports) plotByReportId.set(r.id, plotCode)
  }

  const groups: Record<string, FollowupAreaRow['cells']> = {}
  for (const followup of Object.values(scoutData.followupsByReportId)) {
    const plotCode = plotByReportId.get(followup.scoutReportId)
    if (!plotCode || !groupByPlot.has(plotCode)) continue
    const outcome = followup.cropStatus
    if (!(OVERVIEW_FOLLOWUP_OUTCOMES as readonly string[]).includes(outcome)) continue

    const group = groupByPlot.get(plotCode)!
    groups[group] ??= {
      Improved: { plots: 0, area: 0 },
      'Same-Status': { plots: 0, area: 0 },
      'Still-Worst': { plots: 0, area: 0 },
    }
    const cell = groups[group][outcome as (typeof OVERVIEW_FOLLOWUP_OUTCOMES)[number]]
    cell.plots++
    cell.area += areaByPlot.get(plotCode) ?? 0
  }

  const groupNames = Object.keys(groups).sort((a, b) => {
    const totalA = OVERVIEW_FOLLOWUP_OUTCOMES.reduce((s, o) => s + groups[a][o].plots, 0)
    const totalB = OVERVIEW_FOLLOWUP_OUTCOMES.reduce((s, o) => s + groups[b][o].plots, 0)
    return totalB - totalA
  })

  return groupNames.map((group) => ({ group, cells: groups[group] }))
}
