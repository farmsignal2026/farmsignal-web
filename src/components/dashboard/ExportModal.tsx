import { useState } from 'react'
import {
  buildDetailReport,
  buildScoutStatusReport,
  buildScoutVisitImpactReport,
  buildSummaryReport,
} from '../../features/fields/exports'
import type { Field, FieldGeo } from '../../features/fields/types'
import { useStageResolver } from '../../features/fields/useFieldsData'
import { downloadXLSX } from '../../lib/exportUtils'
import type { Officer } from '../../features/officers/types'
import type { ScoutData } from '../../features/scout/types'

interface ExportModalProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  scoutData: ScoutData | undefined
  officers: Officer[]
  onClose: () => void
}

interface ReportDef {
  key: string
  label: string
  description: string
  needsScout: boolean
  build: () => Record<string, unknown>[]
  filenamePrefix: string
  sheetName: string
}

/** Ports source's 6-report "⬇ Export Table CSV" sidebar section
 * (RS_Cane_Monitoring_S1.html:689-702), condensed to 4 per user direction
 * (#5/#6 merged into one row-per-visit report instead of two separate
 * files) and switched from plain CSV to real .xlsx via SheetJS so every
 * numeric column stays a real number, not quoted text — pivots straight
 * into Excel without reformatting. The AI Insights tab's own 5 sections
 * each get their own inline export button next to their "Select all"
 * instead of living here — this modal got too crowded once they were
 * added, per direct user feedback (2026-08-09). */
export function ExportModal({ fields, geoByCode, scoutData, officers, onClose }: ExportModalProps) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const stageResolver = useStageResolver()

  const reports: ReportDef[] = [
    {
      key: 'detail',
      label: 'NDVI Trend data',
      description: 'One row per confirmed satellite observation for every plot currently in view.',
      needsScout: false,
      build: () => buildDetailReport(fields, geoByCode, stageResolver),
      filenamePrefix: 'ndvi_trend_data',
      sheetName: 'NDVI Trend Data',
    },
    {
      key: 'summary',
      label: 'Current Health status',
      description: 'One row per plot — current status plus season min/max/avg NDVI and observation counts.',
      needsScout: false,
      build: () => buildSummaryReport(fields, geoByCode, stageResolver),
      filenamePrefix: 'current_health_status',
      sheetName: 'Current Health Status',
    },
    {
      key: 'scoutStatus',
      label: 'Division scout status',
      description: 'One row per plot — scout status, assigned officer, last visit date.',
      needsScout: true,
      build: () => buildScoutStatusReport(fields, geoByCode, scoutData!, officers, stageResolver),
      filenamePrefix: 'division_scout_status',
      sheetName: 'Scout Status',
    },
    {
      key: 'visitImpact',
      label: 'Scout Visit & Impact',
      description: 'One row per scout visit — flagged issues, crop status at the time, and follow-up outcome.',
      needsScout: true,
      build: () => buildScoutVisitImpactReport(fields, geoByCode, scoutData!, officers, stageResolver),
      filenamePrefix: 'scout_visit_impact',
      sheetName: 'Scout Visit Impact',
    },
  ]

  async function handleDownload(report: ReportDef) {
    setDownloading(report.key)
    setDownloadError(null)
    try {
      const rows = report.build()
      if (rows.length === 0) {
        window.alert('No data to export for the current filter set.')
        return
      }
      downloadXLSX(report.filenamePrefix, report.sheetName, rows)
    } catch (e) {
      setDownloadError(`Could not build "${report.label}": ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">Export Reports</div>
            <div className="text-[11px] text-neutral-400">Reflects the fields currently in view (sidebar + stat-card filters).</div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="space-y-2 p-4">
          {downloadError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{downloadError}</div>
          )}
          {reports.map((r) => {
            const disabled = r.needsScout && !scoutData
            return (
              <button
                key={r.key}
                type="button"
                disabled={disabled || downloading !== null}
                onClick={() => handleDownload(r)}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-neutral-200 p-3 text-left hover:border-green-300 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:bg-white"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-700">{r.label}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-400">
                    {disabled ? 'Scout data still loading…' : r.description}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-green-700">
                  {downloading === r.key ? 'Exporting…' : '⬇ .xlsx'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
