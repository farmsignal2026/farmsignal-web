import type { ScoutData } from '../scout/types'
import { COMPARE_GROUP_LABEL, groupValueFor, type CompareGroupKey } from './compare'
import type { Field, FieldGeo } from './types'

/** The source HTML only offers 4 group-by dimensions here
 * (RS_Cane_Monitoring_S1.html:1248-1251), with Client/Factory conflated
 * into one "Mill / Client" button — the exact same bug Compare had before
 * it got split into separate `client`/`factory` dimensions. Rather than
 * re-introduce that bug in a second tab, Scout Analytics reuses Compare's
 * FULL `CompareGroupKey`/`groupValueFor`/`COMPARE_GROUP_LABEL` directly —
 * same 7 dimensions, same labels, one source of truth for both tabs. */
export type ScoutGroupKey = CompareGroupKey
export const SCOUT_GROUP_LABEL = COMPARE_GROUP_LABEL

export type ScoutView = 'status' | 'reasons' | 'followup' | 'yield'
export type ScoutMetric = 'count' | 'pct'

/** Ascending by total — Chart.js horizontal bars render the first label at
 * the BOTTOM, so ascending order puts the highest-value group at the
 * visual top (ports `saSortGroupsByTotal()`, :8211-8217 — ALWAYS a plain
 * total sort here, unlike Compare's stage/plotType natural-order special
 * case, since Scout Analytics has no vertical-chart "biggest first" reason
 * to deviate from it). */
function sortGroupsByTotal(names: string[], totalFor: (name: string) => number): string[] {
  return [...names].sort((a, b) => totalFor(a) - totalFor(b))
}

/** Exported so aiInsights.ts's Scout Recommendation can reuse the same
 * "which report counts as this plot's latest" lookup instead of a second
 * copy. */
export function latestReport(scoutData: ScoutData, plotCode: string) {
  const reports = scoutData.reportsByPlot[plotCode]
  return reports && reports.length > 0 ? reports[0] : null
}

export const SCOUT_STATUSES = ['Unattended', 'Scouted', 'Overdue', 'Closed'] as const
export type ScoutStatus = (typeof SCOUT_STATUSES)[number]

export const SCOUT_STATUS_COLOR: Record<ScoutStatus, string> = {
  Unattended: '#dc2626',
  Scouted: '#86efac',
  Overdue: '#f07c2a',
  Closed: '#166534',
}

const OVERDUE_DAYS = 15

/** Ports `saScoutStatusForPlot()` (:7838-7855). "Scheduled" is deliberately
 * not a possible result — scheduled-visit dates only ever live in the
 * mobile app's local on-device cache, never synced to Supabase. */
export function scoutStatusForPlot(scoutData: ScoutData, plotCode: string): ScoutStatus {
  const latest = latestReport(scoutData, plotCode)
  if (!latest) return 'Unattended'
  if (scoutData.followupsByReportId[latest.id]) return 'Closed'
  const deadline = new Date(latest.visitDate.getTime() + OVERDUE_DAYS * 86400000)
  if (new Date() > deadline) return 'Overdue'
  return 'Scouted'
}

export interface GroupedResult {
  groupNames: string[]
  buckets: Record<string, Record<string, number>>
  /** Plot codes making up each (group, category) bar segment — lets the
   * chart's click handler jump to Field Cards/Table filtered to exactly
   * the plots behind whichever segment was clicked. */
  plotCodesByGroupCategory: Record<string, Record<string, string[]>>
}

function addPlotCode(
  plotCodesByGroupCategory: Record<string, Record<string, string[]>>,
  group: string,
  category: string,
  plotCode: string,
) {
  const byCategory = (plotCodesByGroupCategory[group] ??= {})
  ;(byCategory[category] ??= []).push(plotCode)
}

/** Ports `saRenderStatus()` (:7907-7931). */
export function computeScoutStatus(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: ScoutGroupKey,
  scoutData: ScoutData,
): GroupedResult {
  const buckets: Record<string, Record<string, number>> = {}
  const plotCodesByGroupCategory: Record<string, Record<string, string[]>> = {}
  for (const field of fields) {
    const group = groupValueFor(field, geoByCode, groupKey)
    buckets[group] ??= { Unattended: 0, Scouted: 0, Overdue: 0, Closed: 0, total: 0 }
    const status = scoutStatusForPlot(scoutData, field.code)
    buckets[group][status]++
    buckets[group].total++
    addPlotCode(plotCodesByGroupCategory, group, status, field.code)
  }
  const groupNames = sortGroupsByTotal(Object.keys(buckets), (g) => buckets[g]?.total ?? 0)
  return { groupNames, buckets, plotCodesByGroupCategory }
}

/** Ports SA_CATEGORIES (:7704-7705) — Expect Yield deliberately excluded,
 * it's an outcome/estimate, not a reason for poor health, shown in its own
 * tab instead. Order matches source's fixed legend/stack order (:7976-7977). */
export const SCOUT_REASON_CATEGORIES = [
  'Population Gap',
  'Weed',
  'Irrigation Deficit',
  'Waterlogging',
  'Nutrient Deficit',
  'Pest',
  'Disease',
  'Soil Problem',
  'Others',
] as const

export const SCOUT_REASON_COLOR: Record<string, string> = {
  'Population Gap': '#0C6904',
  Weed: '#6FC767',
  'Irrigation Deficit': '#3D6CE3',
  Waterlogging: '#26206E',
  'Nutrient Deficit': '#E8C93F',
  Pest: '#E8604F',
  Disease: '#DE9D95',
  'Soil Problem': '#997B46',
  Others: '#C293BA',
}

export interface ChecklistEntry {
  status?: string
}

/** Exported so aiInsights.ts's Scout Recommendation can reuse the exact
 * same Moderate/Severe/Very Severe flag definition Scout Reasons uses,
 * rather than a second copy that could drift. */
export function isFlagged(entry: ChecklistEntry | undefined): boolean {
  return entry?.status === 'Moderate' || entry?.status === 'Severe' || entry?.status === 'Very Severe'
}

/** Ports `saRenderReasons()` (:7933-8006) — Moderate/Severe/Very Severe
 * flags from each plot's latest scout visit, tallied per category. */
export function computeScoutReasons(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: ScoutGroupKey,
  scoutData: ScoutData,
): GroupedResult {
  const buckets: Record<string, Record<string, number>> = {}
  const plotCodesByGroupCategory: Record<string, Record<string, string[]>> = {}
  for (const field of fields) {
    const latest = latestReport(scoutData, field.code)
    if (!latest) continue
    const group = groupValueFor(field, geoByCode, groupKey)
    buckets[group] ??= Object.fromEntries(SCOUT_REASON_CATEGORIES.map((c) => [c, 0]))
    for (const cat of SCOUT_REASON_CATEGORIES) {
      const entry = latest.checklist[cat] as ChecklistEntry | undefined
      if (isFlagged(entry)) {
        buckets[group][cat]++
        addPlotCode(plotCodesByGroupCategory, group, cat, field.code)
      }
    }
  }
  const totalFor = (g: string) => SCOUT_REASON_CATEGORIES.reduce((s, c) => s + (buckets[g]?.[c] ?? 0), 0)
  const groupNames = sortGroupsByTotal(Object.keys(buckets), totalFor)
  return { groupNames, buckets, plotCodesByGroupCategory }
}

/** Ports SA_YIELD_BUCKETS/SA_YIELD_COLORS (:7709-7710). */
export const SCOUT_YIELD_BUCKETS = ['Early to Estimate', '<30', '30-40', '40-50', '>50'] as const

export const SCOUT_YIELD_COLOR: Record<string, string> = {
  'Early to Estimate': '#94a3b8',
  '<30': '#dc2626',
  '30-40': '#f07c2a',
  '40-50': '#86efac',
  '>50': '#166534',
}

/** Ports `saRenderYield()` (:8008-8047). */
export function computeScoutYield(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: ScoutGroupKey,
  scoutData: ScoutData,
): GroupedResult {
  const buckets: Record<string, Record<string, number>> = {}
  const plotCodesByGroupCategory: Record<string, Record<string, string[]>> = {}
  for (const field of fields) {
    const latest = latestReport(scoutData, field.code)
    if (!latest) continue
    const entry = latest.checklist['Expect Yield'] as { subCat?: string } | undefined
    const bucket = entry?.subCat
    if (!bucket || !(SCOUT_YIELD_BUCKETS as readonly string[]).includes(bucket)) continue
    const group = groupValueFor(field, geoByCode, groupKey)
    buckets[group] ??= Object.fromEntries(SCOUT_YIELD_BUCKETS.map((b) => [b, 0]))
    buckets[group][bucket]++
    buckets[group].total = (buckets[group].total ?? 0) + 1
    addPlotCode(plotCodesByGroupCategory, group, bucket, field.code)
  }
  const groupNames = sortGroupsByTotal(Object.keys(buckets), (g) => buckets[g]?.total ?? 0)
  return { groupNames, buckets, plotCodesByGroupCategory }
}

export const SCOUT_OUTCOMES = ['Improved', 'Same-Status', 'Still-Worst'] as const
export type ScoutOutcome = (typeof SCOUT_OUTCOMES)[number]

export const SCOUT_OUTCOME_LABEL: Record<ScoutOutcome, string> = {
  Improved: 'Improved',
  'Same-Status': 'Same status',
  'Still-Worst': 'Still worse',
}

export const SCOUT_OUTCOME_COLOR: Record<ScoutOutcome, string> = {
  Improved: '#22a65a',
  'Same-Status': '#eab308',
  'Still-Worst': '#dc2626',
}

/** Ports `saRenderFollowup()` (:8051-8087) — every completed follow-up
 * visit (not just the latest per plot, since a field could in principle be
 * followed up more than once over time and each is its own data point),
 * grouped by the PLOT's current group value. */
export function computeScoutFollowup(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  groupKey: ScoutGroupKey,
  scoutData: ScoutData,
): GroupedResult {
  const groupByPlot = new Map<string, string>()
  for (const field of fields) groupByPlot.set(field.code, groupValueFor(field, geoByCode, groupKey))

  const plotByReportId = new Map<string, string>()
  for (const [plotCode, reports] of Object.entries(scoutData.reportsByPlot)) {
    for (const r of reports) plotByReportId.set(r.id, plotCode)
  }

  const buckets: Record<string, Record<string, number>> = {}
  const plotCodesByGroupCategory: Record<string, Record<string, string[]>> = {}
  for (const followup of Object.values(scoutData.followupsByReportId)) {
    const plotCode = plotByReportId.get(followup.scoutReportId)
    if (!plotCode || !groupByPlot.has(plotCode)) continue
    const group = groupByPlot.get(plotCode)!
    const outcome = followup.cropStatus
    if (!(SCOUT_OUTCOMES as readonly string[]).includes(outcome)) continue
    buckets[group] ??= { Improved: 0, 'Same-Status': 0, 'Still-Worst': 0, total: 0 }
    buckets[group][outcome]++
    buckets[group].total++
    addPlotCode(plotCodesByGroupCategory, group, outcome, plotCode)
  }
  const groupNames = sortGroupsByTotal(Object.keys(buckets), (g) => buckets[g]?.total ?? 0)
  return { groupNames, buckets, plotCodesByGroupCategory }
}
