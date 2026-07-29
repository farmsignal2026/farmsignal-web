import { useMemo, type ReactNode } from 'react'
import { stages } from '../../features/fields/growthStage'
import type { HealthStatus } from '../../features/fields/growthStage'
import { HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'

interface StageSummaryViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  onViewPlotInCards: (plotCode: string) => void
}

const STAGE_COLOR_HEX: Record<string, string> = {
  Germination: '#3b82f6',
  'Early Tiller': '#8b5cf6',
  Tillering: '#0d9488',
  'Grand Growth': '#f59e0b',
  Maturity: '#9ca3af',
}

const HEALTH_COLOR_HEX: Record<HealthStatus, string> = {
  good: '#22a65a',
  optimal: '#f59e0b',
  attention: '#b45309',
  serious: '#dc2626',
  unknown: '#d1d5db',
}

interface Segment {
  key: string
  label: string
  count: number
  color: string
}

/** Ports the stage/health distribution bars (stackedBar() helper,
 * RS_Cane_Monitoring_S1.html:5219-5241) and the Persistent Issues list
 * (:5317-5342). The Farmer Performance Score ranking system is deferred
 * per Phase 2's agreed scope. */
export function StageSummaryView({ fields, geoByCode, onViewPlotInCards }: StageSummaryViewProps) {
  const stageSegments = useMemo<Segment[]>(() => {
    const counts: Record<string, number> = {}
    for (const f of fields) {
      const stage = geoByCode[f.code]?.growthStage || 'Unknown'
      counts[stage] = (counts[stage] ?? 0) + 1
    }
    const order = [...stages.map((s) => s.name), 'Unknown']
    return order
      .filter((name) => counts[name] > 0)
      .map((name) => ({ key: name, label: name, count: counts[name], color: STAGE_COLOR_HEX[name] ?? '#d1d5db' }))
  }, [fields, geoByCode])

  const healthSegments = useMemo<Segment[]>(() => {
    const counts: Record<HealthStatus, number> = { good: 0, optimal: 0, attention: 0, serious: 0, unknown: 0 }
    for (const f of fields) counts[f.healthStatus]++
    const order: HealthStatus[] = ['good', 'optimal', 'attention', 'serious', 'unknown']
    return order
      .filter((key) => counts[key] > 0)
      .map((key) => ({ key, label: HEALTH_LABEL[key], count: counts[key], color: HEALTH_COLOR_HEX[key] }))
  }, [fields])

  const persistentIssues = useMemo(() => {
    return fields
      .filter((f) => f.healthStatus === 'attention' || f.healthStatus === 'serious')
      .map((f) => ({ field: f, streak: geoByCode[f.code]?.attentionStreak ?? 0 }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 10)
  }, [fields, geoByCode])

  return (
    <div className="space-y-6 p-4">
      <SummaryCard title="Crop Stage Distribution">
        <StackedBar segments={stageSegments} total={fields.length} />
      </SummaryCard>

      <SummaryCard title="Crop Health Distribution">
        <StackedBar segments={healthSegments} total={fields.length} />
      </SummaryCard>

      <SummaryCard title="Persistent Issues — longest Need-Attention streaks">
        {persistentIssues.length === 0 ? (
          <div className="py-2 text-xs text-neutral-400">No plots currently in Need Attention.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {persistentIssues.map(({ field, streak }) => {
              const geo = geoByCode[field.code]
              const isSerious = field.healthStatus === 'serious'
              return (
                <button
                  key={field.code}
                  type="button"
                  onClick={() => onViewPlotInCards(field.code)}
                  className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-neutral-50"
                  title="Open this plot in Field cards"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-neutral-700">{field.name}</div>
                    <div className="truncate text-[10px] text-neutral-400">
                      {field.code}
                      {field.division ? ` · ${field.division}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        isSerious ? 'bg-red-50 text-red-600' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {streak} obs{isSerious ? ' · serious' : ''}
                    </span>
                    <div className="mt-0.5 text-[10px] text-neutral-400">
                      NDVI {geo?.ndvi != null ? geo.ndvi.toFixed(2) : '--'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SummaryCard>
    </div>
  )
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  )
}

function StackedBar({ segments, total }: { segments: Segment[]; total: number }) {
  if (total === 0 || segments.length === 0) {
    return <div className="text-xs text-neutral-400">No data</div>
  }

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.count} fields`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-neutral-600">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.label}
            <span className="font-semibold text-neutral-800">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
