import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScoutData, ScoutFollowup, ScoutReport } from './types'

/** Read-only port of the Flutter `ScoutRepository.loadAll()`
 * (farmsignal_flutter/lib/features/scout/data/scout_repository.dart) —
 * reads scout_reports/scout_followups (RLS already scopes rows to the
 * officer's factory/division, see [[farmsignal_supabase_schema_reference]]).
 * Deliberately excludes every write method (insertReport/insertFollowup/
 * uploadPhotos/hasScoutedToday) — this dashboard only views existing
 * records, logging a new scout visit stays a mobile-officer workflow. */
export class ScoutRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async loadAll(): Promise<ScoutData> {
    const { data: reportRows, error: reportErr } = await this.client
      .from('scout_reports')
      .select(
        'id,plot_no,visit_date,follow_up_required,follow_up_date,stress_type,stress_severity,checklist,notes,photo_urls,action_required',
      )
      .order('visit_date', { ascending: false })
    if (reportErr) throw reportErr

    const reportsByPlot: Record<string, ScoutReport[]> = {}
    for (const r of reportRows ?? []) {
      const followUpDateStr = r.follow_up_date as string | null
      const report: ScoutReport = {
        id: r.id as string,
        plotNo: r.plot_no as string,
        visitDate: new Date(r.visit_date as string),
        followUpRequired: Boolean(r.follow_up_required),
        followUpDate: followUpDateStr ? new Date(followUpDateStr) : null,
        stressType: (r.stress_type as string[] | null) ?? [],
        stressSeverity: (r.stress_severity as string | null) ?? null,
        checklist: (r.checklist as Record<string, unknown> | null) ?? {},
        notes: (r.notes as string | null) ?? null,
        photoUrls: (r.photo_urls as string[] | null) ?? [],
        actionRequired: (r.action_required as string[] | null) ?? [],
      }
      ;(reportsByPlot[report.plotNo] ??= []).push(report)
    }

    const { data: followupRows, error: followupErr } = await this.client
      .from('scout_followups')
      .select('scout_report_id,followup_date,adopted,crop_status,help_needed,remarks,photo_urls')
      .order('followup_date', { ascending: false })
    if (followupErr) throw followupErr

    const followupsByReportId: Record<string, ScoutFollowup> = {}
    for (const r of followupRows ?? []) {
      const reportId = r.scout_report_id as string | null
      if (!reportId || followupsByReportId[reportId]) continue
      followupsByReportId[reportId] = {
        scoutReportId: reportId,
        followupDate: new Date(r.followup_date as string),
        adopted: (r.adopted as string | null) ?? '',
        cropStatus: (r.crop_status as string | null) ?? '',
        helpNeeded: (r.help_needed as string | null) ?? '',
        remarks: (r.remarks as string | null) ?? null,
        photoUrls: (r.photo_urls as string[] | null) ?? [],
      }
    }

    return { reportsByPlot, followupsByReportId }
  }
}
