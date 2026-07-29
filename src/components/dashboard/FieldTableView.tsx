import { useMemo, useState } from 'react'
import { HEALTH_BADGE_CLASS, HEALTH_LABEL, stageBadgeClass } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'

interface FieldTableViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
}

type SortKey = 'plot' | 'age' | 'ndvi'
type SortDir = 'asc' | 'desc'

const STATIC_COLUMNS = ['Field', 'Client', 'Division', 'Village', 'Farmer', 'Plot Type']

/** Ports `renderTable()` (RS_Cane_Monitoring_S1.html:5125-5138) — one row
 * per field (latest-only, per Phase 2's agreed scope) instead of one row
 * per historical observation. Plot/Age/NDVI columns are sortable, per
 * user feedback after the initial Phase 2 build. */
export function FieldTableView({ fields, geoByCode }: FieldTableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() => {
    if (!sortKey) return fields
    const arr = [...fields]
    arr.sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'plot') {
        va = a.code
        vb = b.code
      } else if (sortKey === 'age') {
        va = geoByCode[a.code]?.growthDays ?? -1
        vb = geoByCode[b.code]?.growthDays ?? -1
      } else {
        va = geoByCode[a.code]?.ndvi ?? -1
        vb = geoByCode[b.code]?.ndvi ?? -1
      }
      const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [fields, geoByCode, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (fields.length === 0) {
    return <div className="p-10 text-center text-sm text-neutral-400">No records</div>
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
            {STATIC_COLUMNS.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-2 font-semibold">
                {c}
              </th>
            ))}
            <SortableHeader label="Plot" onClick={() => toggleSort('plot')} arrow={sortArrow('plot')} />
            <th className="whitespace-nowrap px-2 py-2 font-semibold">Plant Date</th>
            <SortableHeader label="Age" onClick={() => toggleSort('age')} arrow={sortArrow('age')} />
            <th className="whitespace-nowrap px-2 py-2 font-semibold">Stage</th>
            <SortableHeader label="NDVI" onClick={() => toggleSort('ndvi')} arrow={sortArrow('ndvi')} />
            <th className="whitespace-nowrap px-2 py-2 font-semibold">Range</th>
            <th className="whitespace-nowrap px-2 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((field) => {
            const geo = geoByCode[field.code]
            const ndviRange =
              geo?.thresholdMin != null && geo?.thresholdMax != null
                ? `${geo.thresholdMin.toFixed(2)} - ${geo.thresholdMax.toFixed(2)}`
                : '--'
            return (
              <tr key={field.code} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="max-w-[170px] truncate px-2 py-1.5" title={field.name}>
                  {field.name}
                </td>
                <td className="px-2 py-1.5">{field.factory || '--'}</td>
                <td className="px-2 py-1.5">{field.division || '--'}</td>
                <td className="px-2 py-1.5">{field.village || '--'}</td>
                <td className="px-2 py-1.5">{field.farmerCode || '--'}</td>
                <td className="px-2 py-1.5">{field.type || '--'}</td>
                <td className="px-2 py-1.5">{field.code}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">{field.date || '--'}</td>
                <td className="px-2 py-1.5 font-mono font-semibold">{geo?.growthDays ?? '--'}</td>
                <td className="px-2 py-1.5">
                  {geo?.growthStage ? (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${stageBadgeClass(geo.growthStage)}`}>
                      {geo.growthStage}
                    </span>
                  ) : (
                    <span className="text-neutral-400">--</span>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono font-semibold">
                  {geo?.ndvi != null ? geo.ndvi.toFixed(3) : '--'}
                </td>
                <td className="px-2 py-1.5 font-mono text-neutral-500">{ndviRange}</td>
                <td className="px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${HEALTH_BADGE_CLASS[field.healthStatus]}`}>
                    {HEALTH_LABEL[field.healthStatus]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortableHeader({ label, onClick, arrow }: { label: string; onClick: () => void; arrow: string }) {
  return (
    <th className="whitespace-nowrap px-2 py-2 font-semibold">
      <button type="button" onClick={onClick} className="hover:text-neutral-700">
        {label}
        {arrow}
      </button>
    </th>
  )
}
