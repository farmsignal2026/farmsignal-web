import { computeFieldStats, type PixelBreakdown, type StatCardKey } from '../../features/fields/computeFieldStats'
import type { Field, FieldGeo } from '../../features/fields/types'

const CARD_COLOR: Record<StatCardKey, string> = {
  good: 'text-[#22a65a]',
  optimal: 'text-[#f59e0b]',
  attention: 'text-[#dc2626]',
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

  const pctOfTotal = (acres: number) => (stats.totalAcres ? Math.round((acres / stats.totalAcres) * 100) : 0)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Fields monitored</div>
        <div className="mt-0.5 text-2xl font-bold text-neutral-800">
          {Math.round(stats.totalAcres)} <span className="text-xs font-semibold text-neutral-400">ac</span>
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-500">
          {stats.totalCount} field{stats.totalCount === 1 ? '' : 's'} (100%)
        </div>
        <PixelBar breakdown={stats.totalPixelBreakdown} />
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
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{bucket.label}</div>
            <div className={`mt-0.5 text-2xl font-bold ${CARD_COLOR[key]}`}>
              {Math.round(bucket.acres)} <span className="text-xs font-semibold text-neutral-400">ac</span>
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              {bucket.count} field{bucket.count === 1 ? '' : 's'} ({pctOfTotal(bucket.acres)}%)
            </div>
            <PixelBar breakdown={bucket.pixelBreakdown} />
          </button>
        )
      })}
    </div>
  )
}

/** Ports `pixBarHtml()` (RS_Cane_Monitoring_S1.html:4275-4289) — the
 * area-weighted pixel-class breakdown bar shown under each stat card,
 * distinct from the field-count/acreage above it. Renders nothing when no
 * field in the card has pixel data loaded (matches source's `if(!pb.any...)
 * return ''`). */
function PixelBar({ breakdown }: { breakdown: PixelBreakdown | null }) {
  if (!breakdown) return null
  const { goodPct, modPct, attnPct } = breakdown
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div style={{ width: `${goodPct}%`, backgroundColor: '#22a65a' }} />
        <div style={{ width: `${modPct}%`, backgroundColor: '#f59e0b' }} />
        <div style={{ width: `${attnPct}%`, backgroundColor: '#dc2626' }} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 whitespace-nowrap text-[9.5px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22a65a]" />
          {Math.round(goodPct)}% Good
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
          {Math.round(modPct)}% Mod
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#dc2626]" />
          {Math.round(attnPct)}% Attn
        </span>
      </div>
    </div>
  )
}
