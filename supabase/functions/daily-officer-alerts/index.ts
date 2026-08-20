// Supabase Edge Function — Phase B of the daily officer WhatsApp reminder.
//
// Computes, for every active `role='officer'` account, their own
// Overdue / Unattended / Assigned / Not Mapped counts — scoped to their own
// factory + division(s), exactly what they'd see on the mobile app's Alerts
// screen (lib/features/alerts/presentation/alerts_screen.dart), never the
// factory-wide or client-wide aggregate an admin/manager sees.
//
// PHASE B ONLY: this function computes and returns/logs the per-officer
// payloads. It does NOT send WhatsApp messages yet — that's Phase C, which
// is blocked on MSG91 account setup. Phase C will loop over this same
// `officerAlerts` array and call MSG91's send-template API once per row
// with a non-zero total.
//
// MAINTENANCE WARNING: the classification logic below (growth stage /
// spike guard / attention streak / scout status lifecycle) is ported a
// THIRD time here, alongside farmsignal_flutter's
// lib/features/fields/domain/growth_stage.dart + lib/features/scout/domain/
// scout_status.dart, and farmsignal_web's src/features/fields/growthStage.ts.
// If those thresholds/rules ever change, this file must be updated to
// match by hand — there is no shared source between the three.
//
// Runs with the SERVICE ROLE key (not the anon key) because it computes
// data for every officer in one batch, not one authenticated officer's own
// RLS-scoped view — set SUPABASE_SERVICE_ROLE_KEY as a function secret
// (`supabase secrets set`), never expose it client-side.

import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Growth-stage classification — ported from growth_stage.dart / growthStage.ts
// ---------------------------------------------------------------------------

interface GrowthStage {
  name: string
  cumEnd: number
  tMin: number
  tMax: number
}

const STAGES: GrowthStage[] = [
  { name: 'Germination', cumEnd: 30, tMin: 0.2, tMax: 0.4 },
  { name: 'Early Tiller', cumEnd: 75, tMin: 0.35, tMax: 0.6 },
  { name: 'Tillering', cumEnd: 120, tMin: 0.55, tMax: 0.7 },
  { name: 'Grand Growth', cumEnd: 240, tMin: 0.65, tMax: 0.8 },
  { name: 'Maturity', cumEnd: 360, tMin: 0.6, tMax: 0.7 },
]
const SERIOUS_STREAK_THRESHOLD = 3

function stageForAge(age: number): { stage: GrowthStage; index: number } | null {
  let dayMin = 0
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i]
    if (age >= dayMin && age <= s.cumEnd) return { stage: s, index: i }
    dayMin = s.cumEnd
  }
  if (age > STAGES[STAGES.length - 1].cumEnd) return { stage: STAGES[STAGES.length - 1], index: STAGES.length - 1 }
  if (age < 0) return { stage: STAGES[0], index: 0 }
  return null
}

function statusForNdvi(ndvi: number, stage: GrowthStage): 'good' | 'optimal' | 'attention' {
  if (ndvi > stage.tMax) return 'good'
  if (ndvi >= stage.tMin) return 'optimal'
  return 'attention'
}

interface ObsRow {
  date: Date
  ndvi: number
  isLowConfidence: boolean
}

function spikeGuardLatest(history: ObsRow[]): ObsRow | null {
  let lastConfNdvi: number | null = null
  let latestConf: ObsRow | null = null
  for (let i = 0; i < history.length; i++) {
    const obs = history[i]
    if (obs.isLowConfidence) continue
    if (lastConfNdvi != null && obs.ndvi - lastConfNdvi <= -0.15) {
      const next = history[i + 1]
      if (next && !next.isLowConfidence && Math.abs(next.ndvi - obs.ndvi) <= 0.15) {
        lastConfNdvi = obs.ndvi
        latestConf = obs
      }
      // else: unconfirmed spike, don't update baseline
    } else {
      lastConfNdvi = obs.ndvi
      latestConf = obs
    }
  }
  return latestConf
}

function computeAttentionStreak(history: ObsRow[], plantDate: Date): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h.isLowConfidence) continue
    const age = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
    const sf = stageForAge(age)
    if (!sf) break
    if (statusForNdvi(h.ndvi, sf.stage) === 'attention') streak++
    else break
  }
  return streak
}

/** 'unknown' | 'good' | 'optimal' | 'attention' | 'serious' */
function classifyHealth(history: ObsRow[], plantDate: Date | null): string {
  if (history.length === 0 || !plantDate) return 'unknown'
  let latestForAge: ObsRow | undefined
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].isLowConfidence) {
      latestForAge = history[i]
      break
    }
  }
  latestForAge ??= history[history.length - 1]
  const age = Math.round((latestForAge.date.getTime() - plantDate.getTime()) / 86400000)
  const sf = stageForAge(age)
  if (!sf) return 'unknown'

  const spike = spikeGuardLatest(history)
  if (!spike) return 'unknown'

  const status = statusForNdvi(spike.ndvi, sf.stage)
  if (status !== 'attention') return status
  const streak = computeAttentionStreak(history, plantDate)
  return streak >= SERIOUS_STREAK_THRESHOLD ? 'serious' : 'attention'
}

// ---------------------------------------------------------------------------
// Scout status lifecycle — ported from scout_status.dart
// ---------------------------------------------------------------------------

const FOLLOWUP_AUTO_LIFT_DAYS = 20

type ScoutStatusType = 'unattended' | 'scouted' | 'overdue' | 'closed'

interface ScoutReportRow {
  id: string
  visitDate: Date
  followUpRequired: boolean
  followUpDate: Date | null
}

function computeScoutStatus(
  reportsForPlot: ScoutReportRow[],
  hasFollowup: (reportId: string) => boolean,
  followupCropStatus: (reportId: string) => string | null,
): ScoutStatusType {
  if (reportsForPlot.length === 0) return 'unattended'
  const sorted = [...reportsForPlot].sort((a, b) => b.visitDate.getTime() - a.visitDate.getTime())
  const last = sorted[0]
  const today = new Date()

  if (hasFollowup(last.id)) {
    if (followupCropStatus(last.id) === 'Still-Worst') return 'unattended'
    return 'closed'
  }

  if (last.followUpRequired && last.followUpDate) {
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (last.followUpDate < todayMidnight) return 'overdue'
    return 'scouted'
  }

  return 'closed'
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

interface OfficerAlertCounts {
  officerId: string
  name: string
  phone: string | null
  overdue: number
  unattended: number
  assigned: number
  notMapped: number
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // --- Officers: role='officer' only, per explicit product decision — no
  // WhatsApp reminders to manager/admin/viewer accounts. ---
  const { data: officerRows, error: officerErr } = await supabase
    .from('farm_officers')
    .select('id,name,phone,factory_code,division_code')
    .eq('role', 'officer')
    .eq('is_active', true)
  if (officerErr) throw officerErr

  const officerIds = (officerRows ?? []).map((o) => o.id as string)
  const { data: odRows, error: odErr } = await supabase
    .from('officer_divisions')
    .select('officer_id,division_code')
    .in('officer_id', officerIds)
  if (odErr) throw odErr

  const divisionsByOfficer = new Map<string, Set<string>>()
  for (const row of odRows ?? []) {
    const set = divisionsByOfficer.get(row.officer_id as string) ?? new Set<string>()
    set.add((row.division_code as string).toUpperCase())
    divisionsByOfficer.set(row.officer_id as string, set)
  }
  // Fallback to the officer's own single division_code when they have no
  // officer_divisions rows — mirrors officer_repository.dart:52-64 exactly.
  for (const o of officerRows ?? []) {
    if (!divisionsByOfficer.has(o.id as string) && o.division_code) {
      divisionsByOfficer.set(o.id as string, new Set([(o.division_code as string).toUpperCase()]))
    }
  }

  // --- Active plots ---
  const { data: plotRows, error: plotErr } = await supabase
    .from('v_plots_current')
    .select('plot_no,factory_code,division_code,planting_date')
    .eq('plot_is_active', true)
  if (plotErr) throw plotErr

  // --- NDVI trend (health classification input) — paginated, matches
  // fields_repository.dart's ndvi_trend query. ---
  const trendByPlot = new Map<string, ObsRow[]>()
  let from = 0
  while (true) {
    const { data: batch, error } = await supabase
      .from('ndvi_trend')
      .select('plot_no,obs_date,ndvi_mean,obs_confidence')
      .order('obs_date', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    for (const r of batch ?? []) {
      if (r.ndvi_mean == null) continue
      const pid = r.plot_no as string
      const list = trendByPlot.get(pid) ?? []
      list.push({ date: new Date(r.obs_date as string), ndvi: Number(r.ndvi_mean), isLowConfidence: r.obs_confidence === 'low' })
      trendByPlot.set(pid, list)
    }
    if (!batch || batch.length < 1000) break
    from += 1000
  }

  // --- Boundaries (Not Mapped check) — via the same RPC the apps use, not
  // a direct table query. ---
  const { data: bndRows, error: bndErr } = await supabase.rpc('get_plot_boundaries')
  if (bndErr) throw bndErr
  const mappedPlots = new Set((bndRows ?? []).map((r: { plot_no: string }) => r.plot_no))

  // --- Scout reports + follow-ups (scout status input) ---
  const { data: scoutRows, error: scoutErr } = await supabase
    .from('scout_reports')
    .select('id,plot_no,visit_date,follow_up_required,follow_up_date')
  if (scoutErr) throw scoutErr
  const scoutByPlot = new Map<string, ScoutReportRow[]>()
  for (const r of scoutRows ?? []) {
    const pid = r.plot_no as string
    const list = scoutByPlot.get(pid) ?? []
    list.push({
      id: r.id as string,
      visitDate: new Date(r.visit_date as string),
      followUpRequired: Boolean(r.follow_up_required),
      followUpDate: r.follow_up_date ? new Date(r.follow_up_date as string) : null,
    })
    scoutByPlot.set(pid, list)
  }

  const { data: followupRows, error: followupErr } = await supabase
    .from('scout_followups')
    .select('scout_report_id,crop_status')
  if (followupErr) throw followupErr
  const followupByReportId = new Map<string, string | null>()
  for (const f of followupRows ?? []) {
    followupByReportId.set(f.scout_report_id as string, (f.crop_status as string | null) ?? null)
  }
  const hasFollowup = (reportId: string) => followupByReportId.has(reportId)
  const followupCropStatus = (reportId: string) => followupByReportId.get(reportId) ?? null

  // --- Per-plot health + scout status ---
  const healthByPlot = new Map<string, string>()
  const scoutStatusByPlot = new Map<string, ScoutStatusType>()
  for (const p of plotRows ?? []) {
    const pid = p.plot_no as string
    const history = (trendByPlot.get(pid) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime())
    const plantDate = p.planting_date ? new Date(p.planting_date as string) : null
    healthByPlot.set(pid, classifyHealth(history, plantDate))
    scoutStatusByPlot.set(pid, computeScoutStatus(scoutByPlot.get(pid) ?? [], hasFollowup, followupCropStatus))
  }

  // --- Open alerts assigned to a specific officer (Assigned count) ---
  const { data: assignedRows, error: assignedErr } = await supabase
    .from('alerts')
    .select('plot_no,assigned_to')
    .eq('status', 'open')
    .not('assigned_to', 'is', null)
  if (assignedErr) throw assignedErr
  const assignedPlotsByOfficer = new Map<string, Set<string>>()
  for (const a of assignedRows ?? []) {
    const officerId = a.assigned_to as string
    const set = assignedPlotsByOfficer.get(officerId) ?? new Set<string>()
    set.add(a.plot_no as string)
    assignedPlotsByOfficer.set(officerId, set)
  }

  // --- Per-officer counts, scoped to their own factory + division(s) —
  // mirrors scopeFieldsForUser's officer/viewer branch
  // (lib/features/fields/domain/field_scoping.dart:28-36). ---
  const officerAlerts: OfficerAlertCounts[] = []
  for (const o of officerRows ?? []) {
    const officerId = o.id as string
    const factoryCode = o.factory_code as string | null
    const divisionCodes = divisionsByOfficer.get(officerId)

    const scopedPlots = (plotRows ?? []).filter((p) => {
      if (factoryCode && p.factory_code !== factoryCode) return false
      if (divisionCodes && divisionCodes.size > 0) {
        return divisionCodes.has(((p.division_code as string) ?? '').toUpperCase())
      }
      return true
    })

    const assignedPlots = assignedPlotsByOfficer.get(officerId) ?? new Set<string>()
    let overdue = 0
    let unattended = 0
    let notMapped = 0
    for (const p of scopedPlots) {
      const pid = p.plot_no as string
      const mapped = mappedPlots.has(pid)
      if (!mapped) notMapped++
      const status = scoutStatusByPlot.get(pid) ?? 'unattended'
      if (status === 'overdue') overdue++
      if (mapped && status === 'unattended') {
        const health = healthByPlot.get(pid) ?? 'unknown'
        if (health === 'attention' || health === 'serious') unattended++
      }
    }

    const assigned = assignedPlots.size
    const total = overdue + unattended + assigned + notMapped
    if (total === 0) continue // nothing pending — no message for this officer

    officerAlerts.push({
      officerId,
      name: o.name as string,
      phone: (o.phone as string | null) ?? null,
      overdue,
      unattended,
      assigned,
      notMapped,
    })
  }

  console.log(`Computed alerts for ${officerAlerts.length} officer(s) with pending items:`, officerAlerts)

  // Phase C (blocked on MSG91 setup) will loop over officerAlerts here and
  // call MSG91's send-template API once per row.
  return new Response(JSON.stringify({ officerAlerts }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
