import { computeFieldStats, type StatCardKey } from '../../features/fields/computeFieldStats'
import type { Field, FieldGeo } from '../../features/fields/types'

const CARD_COLOR: Record<StatCardKey, string> = {
  good: 'text-[#22c55e]',
  optimal: 'text-[#f97316]',
  attention: 'text-[#ef4444]',
  serious: 'text-[#7f1d1d]',
  watch: 'text-blue-400',
}

interface StatRowProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  activeFilter: StatCardKey | null
  onSelectFilter: (key: StatCardKey | null) => void
}

/** Ports `renderStats()` / `.stat-card` (RS_Cane_Monitoring_S1.html:4223+).
 * Clicking a card only sets the shared filter state for now — no tab reads
 * it yet, that starts in Phase 2 (Field Cards/Table). */
export function StatRow({ fields, geoByCode, activeFilter, onSelectFilter }: StatRowProps) {
  const stats = computeFieldStats(fields, geoByCode)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <div className="text-2xl font-bold text-neutral-800">{stats.totalCount}</div>
        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          {Math.round(stats.totalAcres)} ac · Total fields
        </div>
      </div>

      {(Object.keys(stats.buckets) as StatCardKey[]).map((key) => {
        const bucket = stats.buckets[key]
        const isActive = activeFilter === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectFilter(isActive ? null : key)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              isActive ? 'border-green-400 ring-1 ring-green-400' : 'border-neutral-200'
            } bg-white hover:border-neutral-300`}
          >
            <div className={`text-2xl font-bold ${CARD_COLOR[key]}`}>{bucket.count}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {Math.round(bucket.acres)} ac · {bucket.label}
            </div>
          </button>
        )
      })}
    </div>
  )
}
