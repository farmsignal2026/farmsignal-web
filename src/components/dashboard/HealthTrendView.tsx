import { useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { computeHealthTrend, type TrendTrack } from '../../features/fields/healthTrend'
import type { Field, FieldGeo } from '../../features/fields/types'

interface HealthTrendViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
}

type ViewAs = 'count' | 'pct'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Default Start = the earliest planting date among the current fields
 * (per user request), falling back to 6 months ago if no field has a
 * planting date at all. */
function defaultStart(fields: Field[]): string {
  let earliest: Date | null = null
  for (const f of fields) {
    if (f.plantDateRaw && (!earliest || f.plantDateRaw < earliest)) earliest = f.plantDateRaw
  }
  if (earliest) return isoDate(earliest)
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return isoDate(d)
}

/** Draws the legend swatch as a thick colored line rather than a filled
 * box, matching the chart's own line style — Chart.js's default legend
 * swatch fills with the dataset's (translucent) backgroundColor, which
 * reads as a washed-out box rather than a line. */
function lineStyleLegendLabels(chart: import('chart.js').Chart) {
  return (chart.data.datasets ?? []).map((ds, i) => ({
    text: String(ds.label ?? ''),
    fillStyle: ds.borderColor as string,
    strokeStyle: ds.borderColor as string,
    lineWidth: 0,
    hidden: !chart.isDatasetVisible(i),
    datasetIndex: i,
  }))
}

/** Health Trend tab (the default landing tab) — fields in Good/Moderate/
 * Need Attention (or, in Crop Stage track, growth stage) over fortnightly
 * snapshots. Ports `renderTrend()`'s Count/% modes
 * (RS_Cane_Monitoring_S1.html:7054-7228); fixed fortnightly sampling and no
 * Year-over-Year view this pass — see plan's agreed scope trims. */
export function HealthTrendView({ fields, geoByCode }: HealthTrendViewProps) {
  const [start, setStart] = useState(() => defaultStart(fields))
  const [startTouched, setStartTouched] = useState(false)
  const [end, setEnd] = useState(isoDate(new Date()))
  const [track, setTrack] = useState<TrendTrack>('health')
  const [viewAs, setViewAs] = useState<ViewAs>('count')

  // Keep Start following the earliest planting date of whatever's
  // currently filtered (e.g. RSCL -> Mundiyampakkam narrows it to that
  // factory's earliest plot) — until the user manually edits it, at which
  // point their choice sticks instead of being silently overwritten by the
  // next filter change.
  useEffect(() => {
    if (!startTouched) setStart(defaultStart(fields))
  }, [fields, startTouched])

  const result = useMemo(() => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59)
    if (startDate > endDate) return null
    return computeHealthTrend(fields, geoByCode, startDate, endDate, track)
  }, [fields, geoByCode, start, end, track])

  const isPct = viewAs === 'pct'

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
        <label className="text-xs font-medium text-neutral-500">
          Start
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              setStartTouched(true)
            }}
            className="mt-1 block rounded-md border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          End
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">Track</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            <ToggleButton active={track === 'health'} onClick={() => setTrack('health')}>
              Health status
            </ToggleButton>
            <ToggleButton active={track === 'stage'} onClick={() => setTrack('stage')}>
              Crop stage
            </ToggleButton>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">View as</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            <ToggleButton active={viewAs === 'count'} onClick={() => setViewAs('count')}>
              Count
            </ToggleButton>
            <ToggleButton active={viewAs === 'pct'} onClick={() => setViewAs('pct')}>
              %
            </ToggleButton>
          </div>
        </div>
      </div>

      <div className="mb-1 text-sm font-semibold text-neutral-700">
        {track === 'health' ? 'Crop Health Trend' : 'Crop Stage Trend'}
      </div>
      <div className="mb-3 text-xs text-neutral-400">
        {track === 'health'
          ? 'No. of fields in Good / Moderate / Need Attention over fortnightly snapshots'
          : 'No. of fields in each growth stage over fortnightly snapshots'}
      </div>

      {!result || result.labels.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-400">
          No observations found in this date range for the current filter.
        </div>
      ) : (
        <div style={{ height: 400 }}>
          {isPct ? (
            <Bar
              data={{
                labels: result.labels,
                datasets: result.series.map((s) => ({
                  label: s.label,
                  data: result.totals.map((total, i) => (total ? Math.round((s.counts[i] / total) * 100) : 0)),
                  backgroundColor: s.color,
                  stack: 'trend',
                })),
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: { font: { size: 11 }, boxWidth: 26, boxHeight: 4, generateLabels: lineStyleLegendLabels },
                  },
                  tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y}%` } },
                },
                scales: {
                  x: { stacked: true, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 18 } },
                  y: { stacked: true, max: 100, title: { display: true, text: 'Percentage of fields (%)' } },
                },
              }}
            />
          ) : (
            <Line
              data={{
                labels: result.labels,
                datasets: result.series.map((s) => ({
                  label: s.label,
                  data: s.counts.map((v) => (v === 0 ? null : v)),
                  borderColor: s.color,
                  backgroundColor: `${s.color}22`,
                  pointRadius: 5,
                  pointBackgroundColor: '#ffffff',
                  pointBorderColor: s.color,
                  pointBorderWidth: 2,
                  pointHoverRadius: 7,
                  borderWidth: 2.5,
                  tension: 0.3,
                  fill: false,
                })),
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: { font: { size: 11 }, boxWidth: 26, boxHeight: 4, generateLabels: lineStyleLegendLabels },
                  },
                  tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y} fields` } },
                },
                scales: {
                  x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 18 } },
                  y: { beginAtZero: true, title: { display: true, text: 'Number of fields' }, ticks: { stepSize: 1 } },
                },
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium ${active ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
    >
      {children}
    </button>
  )
}
