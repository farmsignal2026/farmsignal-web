import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignment, AssignResult, Officer } from './types'

/** Ports the real, working half of source's officer-assignment feature
 * (RS_Cane_Monitoring_S1.html `openAssignModal()`/`confirmAssign()`,
 * :6118-6273) — officer list + the actual `alerts`/`push_notifications`
 * write. Deliberately does NOT port `addOfficer()`/`renderOfficerList()`'s
 * localStorage-based "add officer" UI (no real `farm_officers` row or
 * login account gets created that way — see WEB_DASHBOARD_PLAN.md's Phase
 * 9 caveat) or Scout Summary (confirmed dead code in source — reads from a
 * localStorage history only ever written by the unreachable Export modal;
 * skipped for this phase per user decision). */
export class OfficersRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async loadActive(): Promise<Officer[]> {
    const [{ data: offRows, error: offErr }, { data: odRows, error: odErr }] = await Promise.all([
      this.client.from('farm_officers').select('id,name,phone,role,division_code').eq('is_active', true),
      this.client.from('officer_divisions').select('officer_id,division_code'),
    ])
    if (offErr) throw offErr
    if (odErr) throw odErr

    const divsByOfficer: Record<string, string[]> = {}
    for (const r of odRows ?? []) {
      const officerId = r.officer_id as string
      ;(divsByOfficer[officerId] ??= []).push(r.division_code as string)
    }

    return (offRows ?? []).map((o) => {
      const id = o.id as string
      const fallback = o.division_code as string | null
      return {
        id,
        name: (o.name as string | null) ?? 'Unknown',
        phone: (o.phone as string | null) ?? null,
        role: (o.role as string | null) ?? null,
        divisionCodes: divsByOfficer[id]?.length ? divsByOfficer[id] : fallback ? [fallback] : [],
      }
    })
  }

  /** One open `alerts` row (`alert_type: 'scout_assignment'`) per plot,
   * plus a matching `push_notifications` row the mobile app's Bell reads
   * directly — ports `confirmAssign()`'s Supabase writes verbatim
   * (:6234-6253), extended with an optional manager remark and an
   * "Assigned by" line. Assigning doesn't change scout status by itself —
   * a field only leaves "Unattended" once a real `scout_reports` row
   * exists, same as source's own comment notes (:6264-6268).
   *
   * Both the remark and the assigner's name go into `alerts.message` —
   * confirmed by reading the mobile app's own Alerts screen
   * (farmsignal_flutter/lib/features/alerts/presentation/
   * alerts_screen.dart:240), which renders exactly
   * `alert.message ?? 'Assigned by your manager'` on each Assigned field
   * row and has no separate "assigned by" field of its own — folding both
   * into this one text column is what makes them show up on the phone
   * without a schema change or a mobile app release (per user decision). */
  async assignFieldsToOfficer(
    plotCodes: string[],
    officer: Officer,
    remark: string,
    assignedByName: string | null,
  ): Promise<AssignResult> {
    const today = new Date().toISOString().slice(0, 10)
    const trimmedRemark = remark.trim()
    const assignedByPrefix = assignedByName ? `Assigned by: ${assignedByName}. ` : ''
    const message = assignedByPrefix + (trimmedRemark || 'Scouting assigned by dashboard')
    const result: AssignResult = { okCount: 0, failed: [] }

    for (const plotCode of plotCodes) {
      try {
        const { data: alertRow, error: alertErr } = await this.client
          .from('alerts')
          .insert({
            plot_no: plotCode,
            alert_type: 'scout_assignment',
            alert_date: today,
            message,
            status: 'open',
            assigned_to: officer.id,
            assigned_date: today,
          })
          .select('id')
          .single()
        if (alertErr) throw alertErr

        const { error: notifErr } = await this.client.from('push_notifications').insert({
          alert_id: alertRow.id,
          officer_id: officer.id,
          title: 'New field assigned for scouting',
          body: trimmedRemark ? `${plotCode} — ${trimmedRemark}` : plotCode,
        })
        if (notifErr) throw notifErr

        result.okCount++
      } catch (e) {
        result.failed.push({ plotCode, message: e instanceof Error ? e.message : String(e) })
      }
    }

    return result
  }

  /** Every currently-open scout-assignment alert — the "undo a mistake"
   * view, since there's no Scout Summary (dead in source, skipped this
   * phase). Requires the `alerts_senior_update` policy (admin/manager
   * UPDATE on `alerts`) to exist — the original schema only ever let the
   * ASSIGNED OFFICER update their own alert, never the manager who created
   * it, so cancelling was previously impossible even via direct SQL. */
  async loadOpenAssignments(): Promise<Assignment[]> {
    const { data, error } = await this.client
      .from('alerts')
      .select('id,plot_no,message,assigned_to,assigned_date')
      .eq('alert_type', 'scout_assignment')
      .eq('status', 'open')
      .order('assigned_date', { ascending: false })
    if (error) throw error

    return (data ?? []).map((r) => ({
      id: r.id as string,
      plotCode: r.plot_no as string,
      officerId: r.assigned_to as string,
      message: (r.message as string | null) ?? null,
      assignedDate: (r.assigned_date as string | null) ?? null,
    }))
  }

  /** Ports the mobile app's own "what counts as still assigned" query
   * (`alerts_repository.dart`: `.eq('assigned_to', officerId).eq('status',
   * 'open')`) in reverse — flipping `status` away from 'open' makes the
   * assignment vanish from the officer's phone immediately, without a hard
   * delete (keeps an audit trail, and avoids needing a DELETE RLS policy
   * on top of the UPDATE one this already needs). */
  async cancelAssignment(alertId: string): Promise<void> {
    const { error } = await this.client.from('alerts').update({ status: 'cancelled' }).eq('id', alertId)
    if (error) throw error
  }
}
