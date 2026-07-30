import { scoutCategories, severityColor } from '../../features/scout/scoutCategories'
import type { ScoutReport } from '../../features/scout/types'

interface ChecklistEntry {
  status?: string
  subCat?: string | string[]
  otherText?: string
  subSeverities?: Record<string, string>
}

/** Read-only rendering of a stored `scout_reports.checklist` JSON blob.
 * Ports `renderScoutChecklistHTML()` (RS_Cane_Monitoring_S1.html:6504-6544) /
 * farmsignal_flutter's scout_checklist_view.dart. */
export function ScoutChecklistView({ checklist }: { checklist: Record<string, unknown> }) {
  if (!checklist || Object.keys(checklist).length === 0) {
    return <div className="text-xs text-neutral-400">No scout record found for this field yet.</div>
  }

  return (
    <div className="divide-y divide-neutral-100">
      {scoutCategories.map((category) => {
        const entry = (checklist[category.key] as ChecklistEntry | undefined) ?? {}
        const otherText = entry.otherText
        const subSeverities = entry.subSeverities

        if (subSeverities && Object.keys(subSeverities).length > 0) {
          return (
            <div key={category.key} className="py-1.5">
              <div className="text-xs font-semibold text-neutral-700">{category.key}</div>
              {Object.entries(subSeverities).map(([subKey, severity]) => (
                <div key={subKey} className="mt-1 flex items-center justify-between pl-3">
                  <span className="text-[10px] text-neutral-500">
                    {subKey === 'Other' && otherText ? `Other — ${otherText}` : subKey}
                  </span>
                  <SeverityBadge status={severity} />
                </div>
              ))}
            </div>
          )
        }

        const status = entry.status
        const subCatRaw = entry.subCat
        let subText = ''
        if (Array.isArray(subCatRaw) && subCatRaw.length > 0) {
          subText = subCatRaw.map((s) => (s === 'Other' && otherText ? `Other — ${otherText}` : s)).join(', ')
        } else if (typeof subCatRaw === 'string') {
          subText = subCatRaw === 'Other' && otherText ? `Other — ${otherText}` : subCatRaw
        } else if (otherText) {
          subText = otherText
        }

        return (
          <div key={category.key} className="flex items-center justify-between py-1.5">
            <span className="text-xs text-neutral-700">
              {category.key}
              {subText && <span className="text-neutral-400"> ({subText})</span>}
            </span>
            {status ? <SeverityBadge status={status} /> : <span className="text-[9px] text-neutral-300">–</span>}
          </div>
        )
      })}
    </div>
  )
}

function SeverityBadge({ status }: { status: string }) {
  const c = severityColor(status)
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-bold"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {status}
    </span>
  )
}

/** Ports `scoutReportRemarksLines()` — reads "Others" free text from the
 * structured checklist JSON (not duplicated into `notes` for reports saved
 * after the mobile app's own cleanup) alongside the officer's own remarks. */
export function scoutReportRemarksLines(report: ScoutReport): { label: string; value: string }[] {
  const othersEntry = report.checklist.Others as { otherText?: string } | undefined
  const othersText = othersEntry?.otherText
  const lines: { label: string; value: string }[] = []
  if (othersText) lines.push({ label: 'Others', value: othersText })
  if (report.notes) lines.push({ label: 'Remarks', value: report.notes })
  return lines
}
