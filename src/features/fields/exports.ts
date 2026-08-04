import { computePlantingDateSuspicion, computeWeedSuspicion, scoutWeedStatus as getScoutWeedStatus } from './aiInsights'
import { HEALTH_LABEL } from './badgeStyles'
import { classifyHistory, type ClassifiedObservation } from './classifyHistory'
import { areaFor } from './computeFieldStats'
import { seriousStreakThreshold, stageForAge } from './growthStage'
import { isFlagged, latestReport, scoutStatusForPlot, SCOUT_REASON_CATEGORIES, type ChecklistEntry } from './scoutAnalytics'
import type { Field, FieldGeo } from './types'
import { recommendationGiven, type ScoutData } from '../scout/types'
import type { Officer } from '../officers/types'

const HEALTH_LABEL_SHORT: Record<string, string> = { good: 'Good', optimal: 'Moderate', attention: 'Need Attention' }

/** Round to 3dp and keep it a `number`, not a string — every column here
 * must stay numeric so Excel can sum/average it in a PivotTable, unlike
 * source's plain-CSV exports which quoted everything as text. */
function num(n: number, dp = 3): number {
  return Number(n.toFixed(dp))
}

// ---------------------------------------------------------------------------
// A1. Detail — one row per CONFIRMED satellite observation.
// ---------------------------------------------------------------------------

export function buildDetailReport(fields: Field[], geoByCode: Record<string, FieldGeo>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (const field of fields) {
    const geo = geoByCode[field.code]
    const history = classifyHistory(field, geo)
    for (const row of history) {
      if (row.isUnconfirmed) continue
      const sf = stageForAge(row.age)
      rows.push({
        Farmer: field.name,
        Client: field.clientCode ?? '',
        'Factory/Mill': field.factory,
        Division: field.division,
        Village: field.village,
        Section: field.section,
        'Plot Code': field.code,
        'Plot Type': field.type,
        Variety: field.variety,
        'Sat Date': row.date,
        'Planting Date': field.plantDateRaw,
        'Age (days)': row.age,
        Stage: sf?.stage.name ?? '',
        NDVI: num(row.ndvi),
        Status: HEALTH_LABEL_SHORT[row.status] ?? row.status,
        Confidence: 'Confirmed',
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// A2. Summary — one row per plot (confirmed observations only, consistent
// with A1 so pivoting A1 reproduces these same season stats).
// ---------------------------------------------------------------------------

export function buildSummaryReport(fields: Field[], geoByCode: Record<string, FieldGeo>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (const field of fields) {
    const geo = geoByCode[field.code]
    const history = classifyHistory(field, geo).filter((r) => !r.isUnconfirmed)
    if (history.length === 0) continue
    const latest = history[history.length - 1]
    const sf = stageForAge(latest.age)
    const ndvis = history.map((r) => r.ndvi)
    const good = history.filter((r) => r.status === 'good').length
    const moderate = history.filter((r) => r.status === 'optimal').length
    const attention = history.filter((r) => r.status === 'attention').length

    rows.push({
      Farmer: field.name,
      Client: field.clientCode ?? '',
      'Factory/Mill': field.factory,
      Division: field.division,
      Village: field.village,
      'Plot Code': field.code,
      'Plot Type': field.type,
      Variety: field.variety,
      'Planting Date': field.plantDateRaw,
      'Latest Sat Date': latest.date,
      'Crop Age (days)': latest.age,
      'Current Stage': sf?.stage.name ?? '',
      'Latest NDVI': num(latest.ndvi),
      'Current Status': HEALTH_LABEL_SHORT[latest.status] ?? latest.status,
      'Total Observations': history.length,
      'Min NDVI (season)': num(Math.min(...ndvis)),
      'Max NDVI (season)': num(Math.max(...ndvis)),
      'Avg NDVI (season)': num(ndvis.reduce((s, v) => s + v, 0) / ndvis.length),
      'Good Obs': good,
      'Moderate Obs': moderate,
      'Need Attention Obs': attention,
      'GPS Acreage': num(areaFor(field, geo), 2),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// A3. Suspicion report — combined Weed + Planting Date, reusing the exact
// AI Insights heuristics (not a re-derived copy) so this export always
// matches what the AI Insights tab shows.
// ---------------------------------------------------------------------------

export function buildSuspicionReport(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  const commonCols = (field: Field, geo: FieldGeo | undefined) => ({
    Farmer: field.name,
    Client: field.clientCode ?? '',
    'Factory/Mill': field.factory,
    Division: field.division,
    Village: field.village,
    'Plot Code': field.code,
    Variety: field.variety,
    'Planting Date': field.plantDateRaw,
    'Current Stage': geo?.growthStage ?? '',
    'Latest NDVI': geo?.ndvi != null ? num(geo.ndvi) : '',
    'Current Status': HEALTH_LABEL_SHORT[field.healthStatus] ?? field.healthStatus,
  })

  for (const w of computeWeedSuspicion(fields, geoByCode, scoutData)) {
    rows.push({
      ...commonCols(w.field, geoByCode[w.field.code]),
      'Suspicion Type': 'Weed',
      Reason: `+${w.excess.toFixed(2)} above ${w.stageName} max`,
      'Scout Weed Rating': getScoutWeedStatus(scoutData, w.field.code) ?? '',
    })
  }
  for (const p of computePlantingDateSuspicion(fields, geoByCode)) {
    rows.push({
      ...commonCols(p.field, geoByCode[p.field.code]),
      'Suspicion Type': 'Planting Date',
      Reason: p.note,
      'Scout Weed Rating': getScoutWeedStatus(scoutData, p.field.code) ?? '',
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// A4. Division scout status — one row per plot.
// ---------------------------------------------------------------------------

export function buildScoutStatusReport(
  fields: Field[],
  scoutData: ScoutData,
  officers: Officer[],
): Record<string, unknown>[] {
  const officerById = new Map(officers.map((o) => [o.id, o]))

  return fields
    .map((field) => {
      const report = latestReport(scoutData, field.code)
      const officer = report?.officerId ? officerById.get(report.officerId) : undefined
      return {
        'Plot Code': field.code,
        Division: field.division,
        'Client/Mill': field.clientCode ?? '',
        Farmer: field.name,
        'Scout Status': scoutStatusForPlot(scoutData, field.code),
        Officer: officer?.name ?? (report ? 'Unknown' : ''),
        'Date of Scout': report?.visitDate ?? '',
      }
    })
    .sort((a, b) => a.Division.localeCompare(b.Division) || a['Plot Code'].localeCompare(b['Plot Code']))
}

// ---------------------------------------------------------------------------
// A5-6 combined — "Scout Visit & Impact": one row per scout visit, merging
// what source split across two separate exports (flagged parameters +
// follow-up outcome) into one comprehensive row.
// ---------------------------------------------------------------------------

interface FullChecklistEntry extends ChecklistEntry {
  subCat?: string | string[]
  otherText?: string
}

function flaggedIssuesText(checklist: Record<string, unknown>): string {
  const parts: string[] = []
  for (const cat of SCOUT_REASON_CATEGORIES) {
    const entry = checklist[cat] as FullChecklistEntry | undefined
    if (!isFlagged(entry)) continue
    let label = cat as string
    let subParts = entry?.subCat ? (Array.isArray(entry.subCat) ? [...entry.subCat] : [entry.subCat]) : []
    if (entry?.otherText) {
      subParts = subParts.length ? subParts.map((s) => (s === 'Other' ? entry.otherText! : s)) : [entry.otherText]
    }
    if (subParts.length) label += ` (${subParts.join('/')})`
    parts.push(`${label}: ${entry!.status}`)
  }
  return parts.join('; ')
}

/** Ports source's `cropStatusOnDate()` (RS_Cane_Monitoring_S1.html:6703-6719)
 * — the confirmed NDVI status AS OF a historical visit date, not the
 * plot's current status. A visit from 3 months ago should be judged
 * against what NDVI showed at the time. */
function cropStatusAsOf(history: ClassifiedObservation[], visitDate: Date): string {
  const confirmed = history.filter((r) => !r.isUnconfirmed)
  let idx = -1
  for (let i = 0; i < confirmed.length; i++) {
    if (confirmed[i].date <= visitDate) idx = i
    else break
  }
  if (idx === -1) return 'No data'
  const row = confirmed[idx]
  if (row.status !== 'attention') return HEALTH_LABEL_SHORT[row.status] ?? row.status
  let streak = 0
  for (let i = idx; i >= 0; i--) {
    if (confirmed[i].status === 'attention') streak++
    else break
  }
  return streak >= seriousStreakThreshold ? 'Serious' : 'Attention'
}

export function buildScoutVisitImpactReport(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  officers: Officer[],
): Record<string, unknown>[] {
  const officerById = new Map(officers.map((o) => [o.id, o]))
  const rows: Record<string, unknown>[] = []

  for (const field of fields) {
    const reports = scoutData.reportsByPlot[field.code]
    if (!reports || reports.length === 0) continue
    const history = classifyHistory(field, geoByCode[field.code])
    const sorted = [...reports].sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime())

    sorted.forEach((report, idx) => {
      const followup = scoutData.followupsByReportId[report.id]
      rows.push({
        'Plot Code': field.code,
        Farmer: field.name,
        'Client/Mill': field.clientCode ?? '',
        Division: field.division,
        Village: field.village,
        'Visit #': idx + 1,
        'Visit Date': report.visitDate,
        Officer: (report.officerId ? officerById.get(report.officerId)?.name : undefined) ?? 'Unknown',
        'Crop Status on Visit Date': cropStatusAsOf(history, report.visitDate),
        'Flagged Issues': flaggedIssuesText(report.checklist),
        'Recommendation Given': recommendationGiven(report) ? 'Y' : 'N',
        'Follow-up Date': followup?.followupDate ?? '',
        'Follow-up Crop Status': followup?.cropStatus.replaceAll('-', ' ') ?? '',
        'Farmer Adopted': followup ? (followup.adopted === 'yes' ? 'Y' : followup.adopted === 'no' ? 'N' : '') : '',
        'Expert Help Needed': followup ? (followup.helpNeeded === 'yes' ? 'Y' : followup.helpNeeded === 'no' ? 'N' : '') : '',
        'Follow-up Remarks': followup?.remarks ?? '',
      })
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Table tab export — mirrors FieldTableView.tsx's visible columns exactly
// (including its existing column-label quirks, e.g. "Client" showing
// factory and "Farmer" showing farmerCode) so the file matches what's on
// screen, in whatever order the table is currently sorted.
// ---------------------------------------------------------------------------

export function buildTableExportReport(fields: Field[], geoByCode: Record<string, FieldGeo>): Record<string, unknown>[] {
  return fields.map((field) => {
    const geo = geoByCode[field.code]
    const ndviRange = geo?.thresholdMin != null && geo?.thresholdMax != null ? `${geo.thresholdMin.toFixed(2)} - ${geo.thresholdMax.toFixed(2)}` : ''
    return {
      Field: field.name,
      Client: field.factory,
      Division: field.division,
      Village: field.village,
      Farmer: field.farmerCode,
      'Plot Type': field.type,
      Plot: field.code,
      'Plant Date': field.plantDateRaw,
      Age: geo?.growthDays ?? '',
      Stage: geo?.growthStage ?? '',
      NDVI: geo?.ndvi != null ? num(geo.ndvi) : '',
      Range: ndviRange,
      Status: HEALTH_LABEL[field.healthStatus],
    }
  })
}
