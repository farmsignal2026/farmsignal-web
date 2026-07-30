/** A single row of `scout_reports` — mirrors farmsignal_flutter's
 * lib/features/scout/domain/scout_report.dart 1:1 (already verified against
 * the same Supabase tables). */
export interface ScoutReport {
  id: string
  plotNo: string
  visitDate: Date
  followUpRequired: boolean
  followUpDate: Date | null
  stressType: string[]
  stressSeverity: string | null
  checklist: Record<string, unknown>
  notes: string | null
  photoUrls: string[]
  /** Currently only ever ['Recommendation given'] or []. */
  actionRequired: string[]
}

export function recommendationGiven(report: ScoutReport): boolean {
  return report.actionRequired.includes('Recommendation given')
}

/** A single row of `scout_followups`. */
export interface ScoutFollowup {
  scoutReportId: string
  followupDate: Date
  adopted: string // 'yes' | 'no'
  cropStatus: string // 'Improved' | 'Same-Status' | 'Still-Worst'
  helpNeeded: string // 'yes' | 'no'
  remarks: string | null
  photoUrls: string[]
}

export interface ScoutData {
  reportsByPlot: Record<string, ScoutReport[]>
  followupsByReportId: Record<string, ScoutFollowup>
}
