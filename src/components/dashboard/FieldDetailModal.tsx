import { useMemo, useState, type ReactNode } from 'react'
import { HEALTH_BADGE_CLASS, HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { usePhotos } from '../../features/photos/usePhotos'
import { useScoutData } from '../../features/scout/useScoutData'
import { recommendationGiven, type ScoutFollowup, type ScoutReport } from '../../features/scout/types'
import { NdviTrendSection } from './NdviTrendSection'
import { PhotoGrid } from './PhotoGrid'
import { ScoutChecklistView, scoutReportRemarksLines } from './ScoutChecklistView'

interface FieldDetailModalProps {
  field: Field
  geo: FieldGeo | undefined
  onClose: () => void
  onViewOnMap: () => void
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Unified Field Detail popup — field info, NDVI trend, Scout & Follow-up
 * history, Geotag photos, and a "View on Map" link, replacing the earlier
 * NDVI-only trend popup. Stacked sections (matching FieldMapDetailPanel's
 * pattern), not tabs. Read-only — views records the mobile app already
 * created; see the plan's read-only scope decision. */
export function FieldDetailModal({ field, geo, onClose, onViewOnMap }: FieldDetailModalProps) {
  const scoutQuery = useScoutData()
  const photosQuery = usePhotos(field.code, 'geotag')

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="resize overflow-auto rounded-lg bg-white shadow-xl"
        style={{
          width: 'min(92vw, 1200px)',
          height: 'min(88vh, 900px)',
          minWidth: 420,
          minHeight: 320,
          maxWidth: '95vw',
          maxHeight: '95vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-neutral-100 bg-white p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">{field.name}</div>
            <div className="text-xs text-neutral-400">
              {field.code}
              {field.village ? ` · ${field.village}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HEALTH_BADGE_CLASS[field.healthStatus]}`}>
              {HEALTH_LABEL[field.healthStatus]}
            </span>
            <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          <Section title="Field Info">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetaItem label="Village" value={field.village} />
              <MetaItem label="Area" value={field.area ? `${field.area} Ac` : ''} />
              <MetaItem label="Type" value={field.type} />
              <MetaItem label="Variety" value={field.variety} />
              <MetaItem label="Planted" value={field.date} />
              <MetaItem label="Farmer code" value={field.farmerCode} />
            </div>
            <button
              type="button"
              onClick={() => {
                onViewOnMap()
                onClose()
              }}
              className="mt-3 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              🗺️ View on Map
            </button>
          </Section>

          <Section title="NDVI Trend">
            <NdviTrendSection field={field} geo={geo} />
          </Section>

          <Section title="Scout & Follow-up History">
            {scoutQuery.isLoading && <div className="text-xs text-neutral-400">Loading scout records…</div>}
            {scoutQuery.isError && <div className="text-xs text-red-500">Could not load scout records.</div>}
            {scoutQuery.isSuccess && <ScoutHistory reports={scoutQuery.data.reportsByPlot[field.code] ?? []} followupsByReportId={scoutQuery.data.followupsByReportId} />}
          </Section>

          <Section title="Geotag Photos">
            {photosQuery.isLoading && <div className="text-xs text-neutral-400">Loading photos…</div>}
            {photosQuery.isError && <div className="text-xs text-red-500">Could not load photos.</div>}
            {photosQuery.isSuccess && <PhotoGrid urls={photosQuery.data.map((p) => p.url)} />}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F7F5F0] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="truncate text-[11px] font-semibold text-neutral-700">{value || '—'}</div>
    </div>
  )
}

function ScoutHistory({
  reports,
  followupsByReportId,
}: {
  reports: ScoutReport[]
  followupsByReportId: Record<string, ScoutFollowup>
}) {
  const [previousExpanded, setPreviousExpanded] = useState(false)

  const sorted = useMemo(() => [...reports].sort((a, b) => b.visitDate.getTime() - a.visitDate.getTime()), [reports])

  if (sorted.length === 0) {
    return <div className="text-xs text-neutral-400">No scout record found for this field yet.</div>
  }

  const latest = sorted[0]
  const previous = sorted.slice(1)
  const latestFollowup = followupsByReportId[latest.id]

  return (
    <div className="space-y-3">
      <ScoutVisitCard report={latest} />
      {latestFollowup ? (
        <FollowupVisitCard followup={latestFollowup} />
      ) : (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Follow-up not yet submitted.</div>
      )}

      {previous.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setPreviousExpanded(!previousExpanded)}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-500"
          >
            {previousExpanded ? '▾' : '▸'} Previous Scouts ({previous.length})
          </button>
          {previousExpanded && (
            <div className="mt-2 space-y-3">
              {previous.map((report) => (
                <div key={report.id} className="space-y-2">
                  <ScoutVisitCard report={report} />
                  {followupsByReportId[report.id] ? (
                    <FollowupVisitCard followup={followupsByReportId[report.id]} />
                  ) : (
                    <div className="text-[10px] text-neutral-400">No follow-up submitted for this visit.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScoutVisitCard({ report }: { report: ScoutReport }) {
  return (
    <div className="rounded-lg border border-neutral-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-[#8B4500]">🔭 Scout Visit</span>
        <span className="text-[11px] text-neutral-400">{formatDate(report.visitDate)}</span>
      </div>
      <ScoutChecklistView checklist={report.checklist} />
      <div className="mt-2 text-[11px] text-neutral-600">
        Recommendation given: {recommendationGiven(report) ? 'Yes ✓' : 'No'}
      </div>
      {scoutReportRemarksLines(report).map((line) => (
        <div key={line.label} className="mt-1 text-[11px] text-neutral-600">
          <span className="font-semibold">{line.label}:</span> {line.value}
        </div>
      ))}
      <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Photos</div>
      <div className="mt-1">
        <PhotoGrid urls={report.photoUrls} emptyText="No photos taken." />
      </div>
    </div>
  )
}

function FollowupVisitCard({ followup }: { followup: ScoutFollowup }) {
  return (
    <div className="rounded-lg border border-neutral-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-[#185FA5]">🔁 Follow-up Visit</span>
        <span className="text-[11px] text-neutral-400">{formatDate(followup.followupDate)}</span>
      </div>
      <div className="space-y-1 text-[11px] text-neutral-600">
        <div>
          <span className="font-semibold">Farmer adopted recommendation:</span>{' '}
          {followup.adopted === 'yes' ? 'Yes ✓' : followup.adopted === 'no' ? 'No' : '–'}
        </div>
        <div>
          <span className="font-semibold">Current crop status:</span> {followup.cropStatus.replaceAll('-', ' ')}
        </div>
        <div>
          <span className="font-semibold">Expert help needed:</span>{' '}
          {followup.helpNeeded === 'yes' ? 'Yes — help requested' : followup.helpNeeded === 'no' ? 'No' : '–'}
        </div>
        {followup.remarks && (
          <div>
            <span className="font-semibold">Remarks:</span> {followup.remarks}
          </div>
        )}
      </div>
      <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Photos</div>
      <div className="mt-1">
        <PhotoGrid urls={followup.photoUrls} emptyText="No photos taken." />
      </div>
    </div>
  )
}
