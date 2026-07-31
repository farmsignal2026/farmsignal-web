import type { Chart as ChartInstance } from 'chart.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { computeHealthTrend, computeHealthTrendYoY, type TrendTrack } from '../../features/fields/healthTrend'
import { seasonLabelForYear } from '../../features/fields/season'
import type { Field, FieldGeo } from '../../features/fields/types'
import { lineStyleLegendLabels } from '../../lib/chartLegend'
import { downloadChartExcel, downloadChartPNG, printChartAsPDF } from '../../lib/exportUtils'
import { ExportButtonRow } from './ExportButtonRow'

interface HealthTrendViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  /** Selected Plant Season years from the sidebar filter (string form, as
   * stored in SidebarFilters) — 2+ enables the Plant Season (YoY) view. */
  seasons: string[]
}

type ViewAs = 'count' | 'pct' | 'yoy'

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

/** Health Trend tab (the default landing tab) — fields in Good/Moderate/
 * Need Attention (or, in Crop Stage track, growth stage) over fortnightly
 * snapshots. Ports `renderTrend()`'s Count/% modes
 * (RS_Cane_Monitoring_S1.html:7054-7228); fixed fortnightly sampling and no
 * Year-over-Year view this pass — see plan's agreed scope trims. */
export function HealthTrendView({ fields, geoByCode, seasons }: HealthTrendViewProps) {
  const [start, setStart] = useState(() => defaultStart(fields))
  const [startTouched, setStartTouched] = useState(false)
  const [end, setEnd] = useState(isoDate(new Date()))
  const [track, setTrack] = useState<TrendTrack>('health')
  const [viewAs, setViewAs] = useState<ViewAs>('count')
  const barChartRef = useRef<ChartInstance<'bar'> | null>(null)
  const lineChartRef = useRef<ChartInstance<'line'> | null>(null)

  const yoyEnabled = seasons.length >= 2
  const isYoY = viewAs === 'yoy' && yoyEnabled && track === 'health'

  const setTrackChecked = (t: TrendTrack) => {
    setTrack(t)
    if (t === 'stage' && viewAs === 'yoy') setViewAs('count')
  }

  const yoySeries = useMemo(
    () => (isYoY ? computeHealthTrendYoY(fields, geoByCode, seasons.map(Number)) : null),
    [isYoY, fields, geoByCode, seasons],
  )

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
        {!isYoY && (
          <>
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
          </>
        )}

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">Track</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            <ToggleButton active={track === 'health'} onClick={() => setTrackChecked('health')}>
              Health status
            </ToggleButton>
            <ToggleButton active={track === 'stage'} onClick={() => setTrackChecked('stage')}>
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
            <ToggleButton
              active={viewAs === 'yoy'}
              disabled={!yoyEnabled || track === 'stage'}
              title={
                track === 'stage'
                  ? 'Only available for Health status tracking'
                  : !yoyEnabled
                    ? 'Select 2+ seasons in the Plant Season filter (sidebar) to enable'
                    : undefined
              }
              onClick={() => setViewAs('yoy')}
            >
              Plant Season (YoY)
            </ToggleButton>
          </div>
        </div>
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-700">
            {isYoY ? 'Crop Health Trend — YoY Comparison' : track === 'health' ? 'Crop Health Trend' : 'Crop Stage Trend'}
          </div>
          <div className="text-xs text-neutral-400">
            {isYoY
              ? `Good / Moderate / Need Attention by Days After Planting, ${[...seasons]
                  .sort((a, b) => Number(a) - Number(b))
                  .map((y) => seasonLabelForYear(Number(y)))
                  .join(' vs ')} — aligned by crop age, not calendar date`
              : track === 'health'
                ? 'No. of fields in Good / Moderate / Need Attention over fortnightly snapshots'
                : 'No. of fields in each growth stage over fortnightly snapshots'}
          </div>
        </div>
        {(isYoY ? yoySeries && yoySeries.some((s) => s.points.length > 0) : result && result.labels.length > 0) && (
          <ExportButtonRow
            onPNG={() => downloadChartPNG(barChartRef.current ?? lineChartRef.current, 'Health_trend')}
            onPDF={() =>
              printChartAsPDF(barChartRef.current ?? lineChartRef.current, isYoY ? 'Crop Health Trend — YoY' : 'Crop Health Trend')
            }
            onExcel={() => downloadChartExcel(barChartRef.current ?? lineChartRef.current, isYoY ? 'Health_trend_yoy' : 'Health_trend')}
          />
        )}
      </div>
      <div className="mb-3" />

      {isYoY ? (
        !yoySeries || yoySeries.every((s) => s.points.length === 0) ? (
          <div className="p-10 text-center text-sm text-neutral-400">
            No fields with NDVI data in the selected seasons for the current filter.
          </div>
        ) : (
          <div style={{ height: 400 }}>
            <Line
              ref={lineChartRef}
              data={{
                datasets: yoySeries.map((s) => ({
                  label: s.label,
                  data: s.points.map((p) => ({ x: p.x, y: p.count })),
                  borderColor: s.color,
                  backgroundColor: s.color,
                  borderDash: s.dash,
                  pointRadius: 3,
                  tension: 0.3,
                  fill: false,
                })),
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 26, boxHeight: 4, font: { size: 10 }, generateLabels: lineStyleLegendLabels },
                  },
                  tooltip: {
                    callbacks: {
                      title: (items) => `Crop age: ${items[0].parsed.x} days`,
                      label: (item) => `${item.dataset.label}: ${item.parsed.y} fields`,
                    },
                  },
                },
                scales: {
                  x: { type: 'linear', title: { display: true, text: 'Days After Planting' } },
                  y: { beginAtZero: true, title: { display: true, text: 'Number of fields' }, ticks: { stepSize: 1 } },
                },
              }}
            />
          </div>
        )
      ) : !result || result.labels.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-400">
          No observations found in this date range for the current filter.
        </div>
      ) : (
        <div style={{ height: 400 }}>
          {isPct ? (
            <Bar
              ref={barChartRef}
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
              ref={lineChartRef}
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
  disabled,
  title,
}: {
  active: boolean
  onClick: () => void
  children: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
    >
      {children}
    </button>
  )
}
