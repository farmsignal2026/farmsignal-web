import { useMemo, useState } from 'react'
import { HEALTH_BADGE_CLASS, HEALTH_LABEL, stageBadgeClass } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { NdviSparkline } from './NdviSparkline'
import { NdviTrendModal } from './NdviTrendModal'

const CARDS_PAGE_SIZE = 50

type SortKey = 'plantDate' | 'ndvi'
type SortDir = 'asc' | 'desc'

interface FieldCardsViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
}

/** Ports `renderCards()` (RS_Cane_Monitoring_S1.html:4790+) — latest-only
 * per Phase 2's agreed scope (no expandable per-observation history table),
 * with a real NDVI sparkline per card (Phase 3) that opens a single-plot
 * trend popup on click, instead of showing all plots crowded on one chart. */
export function FieldCardsView({ fields, geoByCode }: FieldCardsViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('plantDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [trendField, setTrendField] = useState<Field | null>(null)

  const sorted = useMemo(() => {
    const arr = [...fields]
    arr.sort((a, b) => {
      let va: number
      let vb: number
      if (sortKey === 'ndvi') {
        va = geoByCode[a.code]?.ndvi ?? 0
        vb = geoByCode[b.code]?.ndvi ?? 0
      } else {
        va = a.plantDateRaw?.getTime() ?? 0
        vb = b.plantDateRaw?.getTime() ?? 0
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return arr
  }, [fields, geoByCode, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / CARDS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageFields = sorted.slice((currentPage - 1) * CARDS_PAGE_SIZE, currentPage * CARDS_PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(1)
  }

  if (fields.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-neutral-400">No matching fields</div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        Sort by
        <button
          type="button"
          onClick={() => toggleSort('plantDate')}
          className={`rounded-md border px-2 py-1 ${sortKey === 'plantDate' ? 'border-green-400 text-green-700' : 'border-neutral-200'}`}
        >
          Planting date {sortKey === 'plantDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          type="button"
          onClick={() => toggleSort('ndvi')}
          className={`rounded-md border px-2 py-1 ${sortKey === 'ndvi' ? 'border-green-400 text-green-700' : 'border-neutral-200'}`}
        >
          Latest NDVI {sortKey === 'ndvi' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pageFields.map((field) => (
          <FieldCard
            key={field.code}
            field={field}
            geo={geoByCode[field.code]}
            onOpenTrend={() => setTrendField(field)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 text-xs">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-neutral-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {trendField && (
        <NdviTrendModal field={trendField} geo={geoByCode[trendField.code]} onClose={() => setTrendField(null)} />
      )}
    </div>
  )
}

function FieldCard({
  field,
  geo,
  onOpenTrend,
}: {
  field: Field
  geo: FieldGeo | undefined
  onOpenTrend: () => void
}) {
  const ndviRange =
    geo?.thresholdMin != null && geo?.thresholdMax != null
      ? `${geo.thresholdMin.toFixed(2)} - ${geo.thresholdMax.toFixed(2)}`
      : 'N/A'
  const latestHistory = geo?.history[geo.history.length - 1]

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-800">{field.name}</div>
          <div className="mt-0.5 text-xs font-semibold text-neutral-600">
            {field.code}
            {field.type && (
              <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                {field.type}
              </span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${HEALTH_BADGE_CLASS[field.healthStatus]}`}>
          {HEALTH_LABEL[field.healthStatus]}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-[11px] text-neutral-500">
        <div>
          {field.factory}
          {field.village ? ` · ${field.village}` : ''}
        </div>
        <div>
          {field.division}
          {field.section ? ` · ${field.section}` : ''}
        </div>
        {(field.variety || field.cropType) && (
          <div>
            {field.variety}
            {field.variety && field.cropType ? ' · ' : ''}
            {field.cropType}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-2 text-center">
        <div>
          <div className="text-xs font-bold text-neutral-800">{field.date || '—'}</div>
          <div className="text-[9px] uppercase text-neutral-400">
            planting {geo?.growthDays != null ? `· ${geo.growthDays}d` : ''}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold text-neutral-800">{geo?.history.length ?? 0}</div>
          <div className="text-[9px] uppercase text-neutral-400">observations</div>
        </div>
        <div>
          <div className="text-xs font-bold text-neutral-800">
            {geo?.ndvi != null ? geo.ndvi.toFixed(3) : '—'}
          </div>
          <div className="text-[9px] uppercase text-neutral-400">
            {latestHistory?.isS1 ? '~ S1 est' : 'S2'} {latestHistory ? `· ${latestHistory.date.toLocaleDateString()}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${stageBadgeClass(geo?.growthStage ?? '')}`}>
          {geo?.growthStage || 'N/A'}
        </span>
        <span className="text-[10px] text-neutral-400">{ndviRange}</span>
      </div>

      <button
        type="button"
        onClick={onOpenTrend}
        className="mt-2 w-full rounded-md border border-neutral-100 bg-neutral-50 py-1 hover:border-neutral-200"
        title="View NDVI trend"
      >
        <NdviSparkline field={field} geo={geo} />
      </button>
    </div>
  )
}
