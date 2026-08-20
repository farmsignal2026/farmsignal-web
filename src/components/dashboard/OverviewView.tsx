import { useMemo, useState, type ReactNode } from 'react'
import { HEALTH_COLOR_HEX } from '../../features/fields/badgeStyles'
import {
  computeOverviewFollowupByArea,
  computeOverviewHealth,
  computeOverviewReasons,
  computePlotCoverage,
  computeRelevantScoutStatus,
  computeScoutTrackingKPIs,
  OVERVIEW_FOLLOWUP_OUTCOMES,
  type OverviewGroupKey,
} from '../../features/fields/overview'
import { SCOUT_REASON_CATEGORIES, SCOUT_STATUS_COLOR, SCOUT_STATUSES } from '../../features/fields/scoutAnalytics'
import type { Field, FieldGeo } from '../../features/fields/types'
import { useStageResolver } from '../../features/fields/useFieldsData'
import type { ScoutData } from '../../features/scout/types'

interface OverviewViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  scoutData: ScoutData
  onViewGroupInCards: (groupKey: OverviewGroupKey, groupValue: string) => void
}

const FOLLOWUP_LABEL: Record<string, string> = { Improved: 'Improved', 'Same-Status': 'Same status', 'Still-Worst': 'Still worse' }
const FOLLOWUP_COLOR: Record<string, string> = { Improved: '#166534', 'Same-Status': '#d97706', 'Still-Worst': '#dc2626' }
const GROUP_LABEL: Record<OverviewGroupKey, string> = { client: 'Client', factory: 'Factory/Mill', division: 'Division' }

/** Executive Summary / Overview tab — ports source's `renderOverview()`
 * (RS_Cane_Monitoring_S1.html:3754-4140), source's primary landing page
 * (styled there as the sidebar's main CTA, above every other tab). 5
 * sections: Mapped Status, Crop Health, Scout & Follow-up Tracking,
 * Reasons for Poor Crop Health, Follow-up Crop Status — the last three
 * share a Client/Division group-by and a Client→Division drill-down. */
export function OverviewView({ fields, geoByCode, scoutData, onViewGroupInCards }: OverviewViewProps) {
  const [groupKey, setGroupKey] = useState<OverviewGroupKey>('client')
  const [drillClient, setDrillClient] = useState<string | null>(null)
  const [drillFactory, setDrillFactory] = useState<string | null>(null)

  const scopedFields = useMemo(() => {
    if (drillFactory) return fields.filter((f) => (f.factory || 'Unknown') === drillFactory)
    if (drillClient) return fields.filter((f) => (f.clientCode || 'Unknown') === drillClient)
    return fields
  }, [fields, drillClient, drillFactory])
  const effectiveGroupKey: OverviewGroupKey = drillFactory ? 'division' : drillClient ? 'factory' : groupKey

  const coverage = useMemo(() => computePlotCoverage(fields), [fields])
  const health = useMemo(() => computeOverviewHealth(fields), [fields])
  const kpis = useMemo(() => computeScoutTrackingKPIs(fields, scoutData), [fields, scoutData])
  const stageResolver = useStageResolver()
  const statusResult = useMemo(
    () => computeRelevantScoutStatus(scopedFields, geoByCode, scoutData, effectiveGroupKey, stageResolver),
    [scopedFields, geoByCode, scoutData, effectiveGroupKey, stageResolver],
  )
  const reasonRows = useMemo(
    () => computeOverviewReasons(scopedFields, scoutData, effectiveGroupKey),
    [scopedFields, scoutData, effectiveGroupKey],
  )
  const followupRows = useMemo(
    () => computeOverviewFollowupByArea(scopedFields, geoByCode, scoutData, effectiveGroupKey),
    [scopedFields, geoByCode, scoutData, effectiveGroupKey],
  )

  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

  const handleDrill = (groupName: string) => {
    if (effectiveGroupKey === 'client') {
      setDrillClient(groupName)
      return
    }
    if (effectiveGroupKey === 'factory') setDrillFactory(groupName)
  }
  const clearDrill = () => {
    setDrillClient(null)
    setDrillFactory(null)
  }
  const clearFactoryDrill = () => setDrillFactory(null)

  const handleSetGroup = (key: OverviewGroupKey) => {
    setGroupKey(key)
    setDrillClient(null)
    setDrillFactory(null)
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <div className="text-sm font-semibold text-neutral-700">📊 Executive Summary</div>
        <div className="text-xs text-neutral-400">One-shot view for decision making</div>
      </div>

      {/* Section 1: Mapped Status */}
      <SummaryCard title="📍 Mapped Status">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Total Plots" value={coverage.total} valueClass="text-blue-600" sub="per Field Details" />
          <StatTile
            label="Mapped"
            value={coverage.mapped}
            valueClass="text-green-600"
            sub={`${pct(coverage.mapped, coverage.total)}% have a boundary`}
          />
          <StatTile
            label="Not Mapped"
            value={coverage.notMapped}
            valueClass="text-red-700"
            sub={`${pct(coverage.notMapped, coverage.total)}% still pending GPS survey`}
          />
        </div>
      </SummaryCard>

      {/* Section 2: Crop Health */}
      <SummaryCard title="🌱 Crop Health" subtitle="(No. of Fields)">
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Good" value={health.good} valueClass="text-green-600" sub={`${pct(health.good, health.total)}%`} />
          <StatTile label="Moderate" value={health.moderate} valueClass="text-amber-600" sub={`${pct(health.moderate, health.total)}%`} />
          <StatTile label="Need Attention" value={health.attention} valueClass="text-red-600" sub={`${pct(health.attention, health.total)}%`} />
          <StatTile label="Serious" value={health.serious} valueClass="text-red-900" sub={`${pct(health.serious, health.total)}%`} />
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-neutral-100">
          <div style={{ width: `${pct(health.good, health.total)}%`, backgroundColor: HEALTH_COLOR_HEX.good }} />
          <div style={{ width: `${pct(health.moderate, health.total)}%`, backgroundColor: HEALTH_COLOR_HEX.optimal }} />
          <div style={{ width: `${pct(health.attention, health.total)}%`, backgroundColor: HEALTH_COLOR_HEX.attention }} />
          <div style={{ width: `${pct(health.serious, health.total)}%`, backgroundColor: HEALTH_COLOR_HEX.serious }} />
        </div>
      </SummaryCard>

      {/* Section 3: Scout & Follow-up Tracking */}
      <SummaryCard title="🔭 Scout & Follow-up Tracking">
        <div className="grid grid-cols-5 gap-3">
          <StatTile label="Need Attention" value={kpis.needAttention} valueClass="text-red-600" sub="attn + serious" />
          <StatTile label="Total Scouted" value={kpis.totalScouted} valueClass="text-blue-600" sub={`${kpis.uniquePlotsScouted} unique plots`} />
          <StatTile label="This Week" value={kpis.scoutedThisWeek} valueClass="text-green-600" sub="last 7 days" />
          <StatTile label="Follow-up Due" value={kpis.followUpDue} valueClass="text-amber-600" sub="upcoming" />
          <StatTile label="Overdue" value={kpis.overdue} valueClass="text-red-900" sub="past due date" />
        </div>

        <GroupToggle groupKey={groupKey} onSetGroup={handleSetGroup} />
        <DrillBreadcrumb drillClient={drillClient} drillFactory={drillFactory} onClearAll={clearDrill} onClearFactory={clearFactoryDrill} />

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-2 py-1.5 font-medium">{GROUP_LABEL[effectiveGroupKey]}</th>
                <th className="px-2 py-1.5 font-medium">Relevant Plots</th>
                {SCOUT_STATUSES.map((s) => (
                  <th key={s} className="px-2 py-1.5 font-medium" style={{ color: SCOUT_STATUS_COLOR[s] }}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statusResult.groupNames.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-neutral-400">
                    No plots needing attention in the current filter
                  </td>
                </tr>
              ) : (
                statusResult.groupNames.map((g) => {
                  const b = statusResult.buckets[g]
                  return (
                    <tr key={g} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <GroupNameCell name={g} effectiveGroupKey={effectiveGroupKey} onDrill={handleDrill} onViewGroupInCards={onViewGroupInCards} />
                      <td className="px-2 py-1.5 text-neutral-500">{b.total}</td>
                      {SCOUT_STATUSES.map((s) => (
                        <td key={s} className="px-2 py-1.5">
                          <span className="font-bold" style={{ color: SCOUT_STATUS_COLOR[s] }}>
                            {b[s]}
                          </span>{' '}
                          <span className="text-neutral-400">({pct(b[s], b.total)}%)</span>
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SummaryCard>

      {/* Section 4: Reasons for Poor Crop Health */}
      <SummaryCard title="🔍 Reasons for Poor Crop Health" subtitle="Moderate/Severe/Very Severe · latest scout visit per plot">
        <GroupToggle groupKey={groupKey} onSetGroup={handleSetGroup} />
        <DrillBreadcrumb drillClient={drillClient} drillFactory={drillFactory} onClearAll={clearDrill} onClearFactory={clearFactoryDrill} />

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-2 py-1.5 font-medium">{GROUP_LABEL[effectiveGroupKey]}</th>
                <th className="px-2 py-1.5 font-medium">Reports</th>
                {SCOUT_REASON_CATEGORIES.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-[10px] font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reasonRows.length === 0 ? (
                <tr>
                  <td colSpan={SCOUT_REASON_CATEGORIES.length + 2} className="p-4 text-center text-neutral-400">
                    No scout reports yet
                  </td>
                </tr>
              ) : (
                reasonRows.map((row) => {
                  const reasonSum = Object.values(row.counts).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={row.group} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <GroupNameCell name={row.group} effectiveGroupKey={effectiveGroupKey} onDrill={handleDrill} onViewGroupInCards={onViewGroupInCards} />
                      <td className="px-2 py-1.5 text-neutral-500">{row.totalReports} reports</td>
                      {SCOUT_REASON_CATEGORIES.map((cat) => {
                        const count = row.counts[cat]
                        if (!count) return (
                          <td key={cat} className="px-2 py-1.5 text-center text-neutral-300">
                            –
                          </td>
                        )
                        return (
                          <td key={cat} className="px-2 py-1.5">
                            <span className="whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-600">
                              {count} ({pct(count, reasonSum)}%)
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SummaryCard>

      {/* Section 5: Follow-up Crop Status */}
      <SummaryCard title="📈 Follow-up Crop Status" subtitle="Same status / Improved / Still worse — weighted by GPS area, not just plot count">
        <GroupToggle groupKey={groupKey} onSetGroup={handleSetGroup} />
        <DrillBreadcrumb drillClient={drillClient} drillFactory={drillFactory} onClearAll={clearDrill} onClearFactory={clearFactoryDrill} />

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-2 py-1.5 font-medium">{GROUP_LABEL[effectiveGroupKey]}</th>
                {OVERVIEW_FOLLOWUP_OUTCOMES.map((o) => (
                  <th key={o} className="px-2 py-1.5 font-medium" style={{ color: FOLLOWUP_COLOR[o] }}>
                    {FOLLOWUP_LABEL[o]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {followupRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-neutral-400">
                    No follow-up visits recorded yet.
                  </td>
                </tr>
              ) : (
                followupRows.map((row) => {
                  const totalArea = OVERVIEW_FOLLOWUP_OUTCOMES.reduce((s, o) => s + row.cells[o].area, 0)
                  return (
                    <tr key={row.group} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <GroupNameCell name={row.group} effectiveGroupKey={effectiveGroupKey} onDrill={handleDrill} onViewGroupInCards={onViewGroupInCards} />
                      {OVERVIEW_FOLLOWUP_OUTCOMES.map((o) => {
                        const cell = row.cells[o]
                        const pctArea = pct(cell.area, totalArea)
                        return (
                          <td key={o} className="min-w-[110px] px-2 py-1.5">
                            <div className="font-bold" style={{ color: FOLLOWUP_COLOR[o] }}>
                              {cell.plots} <span className="font-medium text-neutral-500">· {cell.area.toFixed(1)}ac ({pctArea}%)</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                              <div style={{ width: `${pctArea}%`, backgroundColor: FOLLOWUP_COLOR[o] }} className="h-full rounded-full" />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SummaryCard>
    </div>
  )
}

function SummaryCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <div className="text-sm font-semibold text-neutral-700">{title}</div>
        {subtitle && <div className="text-[11px] text-neutral-400">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function StatTile({ label, value, valueClass, sub }: { label: string; value: number; valueClass: string; sub: string }) {
  return (
    <div className="rounded-md border border-neutral-100 bg-neutral-50 p-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
      <div className="text-[10px] text-neutral-400">{sub}</div>
    </div>
  )
}

function GroupToggle({ groupKey, onSetGroup }: { groupKey: OverviewGroupKey; onSetGroup: (k: OverviewGroupKey) => void }) {
  const options: OverviewGroupKey[] = ['client', 'factory', 'division']
  return (
    <div className="mt-3 flex gap-1.5">
      {options.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onSetGroup(key)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${groupKey === key ? 'bg-green-600 text-white' : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
        >
          {GROUP_LABEL[key]}
        </button>
      ))}
    </div>
  )
}

function DrillBreadcrumb({
  drillClient,
  drillFactory,
  onClearAll,
  onClearFactory,
}: {
  drillClient: string | null
  drillFactory: string | null
  onClearAll: () => void
  onClearFactory: () => void
}) {
  if (!drillClient) return null
  return (
    <div className="mt-2 text-[11px] text-neutral-500">
      <button type="button" onClick={onClearAll} className="text-blue-600 hover:underline">
        ← All Clients
      </button>{' '}
      ›{' '}
      {drillFactory ? (
        <button type="button" onClick={onClearFactory} className="text-blue-600 hover:underline">
          {drillClient}
        </button>
      ) : (
        <b>{drillClient}</b>
      )}
      {drillFactory && (
        <>
          {' '}
          › <b>{drillFactory}</b>
        </>
      )}
    </div>
  )
}

function GroupNameCell({
  name,
  effectiveGroupKey,
  onDrill,
  onViewGroupInCards,
}: {
  name: string
  effectiveGroupKey: OverviewGroupKey
  onDrill: (name: string) => void
  onViewGroupInCards: (groupKey: OverviewGroupKey, groupValue: string) => void
}) {
  const canDrill = effectiveGroupKey !== 'division'
  if (canDrill) {
    return (
      <td className="px-2 py-1.5">
        <button type="button" onClick={() => onDrill(name)} className="font-semibold text-blue-600 hover:underline" title={`Click to drill into ${name}`}>
          {name} ↓
        </button>
      </td>
    )
  }
  return (
    <td className="px-2 py-1.5">
      <button
        type="button"
        onClick={() => onViewGroupInCards(effectiveGroupKey, name)}
        className="font-semibold text-neutral-700 hover:text-green-700 hover:underline"
        title="Open this group in Field cards"
      >
        {name}
      </button>
    </td>
  )
}
