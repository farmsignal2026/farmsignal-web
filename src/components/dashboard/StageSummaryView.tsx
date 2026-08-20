import { useMemo, useState, type ReactNode } from 'react'
import { classifyHistory } from '../../features/fields/classifyHistory'
import { stages } from '../../features/fields/growthStage'
import type { GrowthStage, HealthStatus } from '../../features/fields/growthStage'
import { HEALTH_COLOR_HEX, HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { useStageResolver } from '../../features/fields/useFieldsData'

interface StageSummaryViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  onViewPlotInCards: (plotCode: string) => void
  onViewPlotsInCards: (plotCodes: string[]) => void
}

const STAGE_COLOR_HEX: Record<string, string> = {
  Germination: '#3b82f6',
  'Early Tiller': '#8b5cf6',
  Tillering: '#0d9488',
  'Grand Growth': '#f59e0b',
  Maturity: '#9ca3af',
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
export function StageSummaryView({ fields, geoByCode, onViewPlotInCards, onViewPlotsInCards }: StageSummaryViewProps) {
  const [issuesSelected, setIssuesSelected] = useState<Set<string>>(new Set())
  const [goodSelected, setGoodSelected] = useState<Set<string>>(new Set())
  const stageResolver = useStageResolver()
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

  const consistentGood = useMemo(() => {
    return fields
      .filter((f) => f.healthStatus === 'good')
      .map((f) => ({ field: f, streak: computeGoodStreak(f, geoByCode[f.code], stageResolver(f.factoryCode, f.clientCode)) }))
      .filter(({ streak }) => streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 10)
  }, [fields, geoByCode, stageResolver])

  return (
    <div className="space-y-6 p-4">
      <SummaryCard title="Crop Stage Distribution">
        <StackedBar segments={stageSegments} total={fields.length} />
      </SummaryCard>

      <SummaryCard title="Crop Health Distribution">
        <StackedBar segments={healthSegments} total={fields.length} />
      </SummaryCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SummaryCard title="Persistent Issues — longest Need-Attention streaks">
          <SelectionHeader
            items={persistentIssues}
            selected={issuesSelected}
            onChange={setIssuesSelected}
            onViewSelected={() => onViewPlotsInCards([...issuesSelected])}
          />
          <StreakList
            items={persistentIssues}
            geoByCode={geoByCode}
            onViewPlotInCards={onViewPlotInCards}
            selected={issuesSelected}
            onToggleSelect={(code) => toggleSelection(setIssuesSelected, code)}
            emptyMessage="No plots currently in Need Attention."
            badgeClass={({ field }) => (field.healthStatus === 'serious' ? 'bg-red-50 text-red-600' : 'bg-amber-100 text-amber-800')}
            badgeText={({ field, streak }) => `${streak} obs${field.healthStatus === 'serious' ? ' · serious' : ''}`}
          />
        </SummaryCard>

        <SummaryCard title="Consistent Good Performance — longest Good streaks">
          <SelectionHeader
            items={consistentGood}
            selected={goodSelected}
            onChange={setGoodSelected}
            onViewSelected={() => onViewPlotsInCards([...goodSelected])}
          />
          <StreakList
            items={consistentGood}
            geoByCode={geoByCode}
            onViewPlotInCards={onViewPlotInCards}
            selected={goodSelected}
            onToggleSelect={(code) => toggleSelection(setGoodSelected, code)}
            emptyMessage="No plots currently on a Good streak."
            badgeClass={() => 'bg-green-50 text-green-600'}
            badgeText={({ streak }) => `${streak} obs · good`}
          />
        </SummaryCard>
      </div>
    </div>
  )
}

function toggleSelection(setSelected: (updater: (prev: Set<string>) => Set<string>) => void, code: string) {
  setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    return next
  })
}

/** "Select all" checkbox + "View N selected in Field Cards" action, shared
 * by both streak lists — lets a user pick several plots from this ranked
 * list and open them together in Field Cards instead of clicking through
 * one at a time. */
function SelectionHeader({
  items,
  selected,
  onChange,
  onViewSelected,
}: {
  items: StreakItem[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  onViewSelected: () => void
}) {
  if (items.length === 0) return null
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.field.code))

  return (
    <div className="mb-2 flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onChange(allSelected ? new Set() : new Set(items.map((i) => i.field.code)))}
          className="h-3.5 w-3.5 rounded border-neutral-300"
        />
        Select all ({items.length})
      </label>
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onViewSelected}
          className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700"
        >
          View {selected.size} in Field cards →
        </button>
      )}
    </div>
  )
}

interface StreakItem {
  field: Field
  streak: number
}

function StreakList({
  items,
  geoByCode,
  onViewPlotInCards,
  selected,
  onToggleSelect,
  emptyMessage,
  badgeClass,
  badgeText,
}: {
  items: StreakItem[]
  geoByCode: Record<string, FieldGeo>
  onViewPlotInCards: (plotCode: string) => void
  selected: Set<string>
  onToggleSelect: (plotCode: string) => void
  emptyMessage: string
  badgeClass: (item: StreakItem) => string
  badgeText: (item: StreakItem) => string
}) {
  if (items.length === 0) {
    return <div className="py-2 text-xs text-neutral-400">{emptyMessage}</div>
  }
  return (
    <div className="divide-y divide-neutral-100">
      {items.map((item) => {
        const { field } = item
        const geo = geoByCode[field.code]
        return (
          <div key={field.code} className="flex items-center gap-2 py-2 hover:bg-neutral-50">
            <input
              type="checkbox"
              checked={selected.has(field.code)}
              onChange={() => onToggleSelect(field.code)}
              className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300"
              aria-label={`Select ${field.name}`}
            />
            <button
              type="button"
              onClick={() => onViewPlotInCards(field.code)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
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
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badgeClass(item)}`}>{badgeText(item)}</span>
                <div className="mt-0.5 text-[10px] text-neutral-400">NDVI {geo?.ndvi != null ? geo.ndvi.toFixed(2) : '--'}</div>
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Consecutive CONFIRMED (non-low-confidence/S1) observations a field has
 * been classified 'good', walking back from its latest reading — the
 * positive mirror of `computeAttentionStreak()` (growthStage.ts), but
 * computed here from the read-only classified history rather than stored
 * on `FieldGeo`, since (unlike attentionStreak) no view needed a "good
 * streak" until now. */
function computeGoodStreak(field: Field, geo: FieldGeo | undefined, stageTable: GrowthStage[]): number {
  const rows = classifyHistory(field, geo, stageTable)
  let streak = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.isUnconfirmed) continue
    if (r.status === 'good') streak++
    else break
  }
  return streak
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
