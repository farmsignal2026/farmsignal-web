import type { Chart as ChartInstance } from 'chart.js'
import { useMemo, useRef, useState } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { classifyHistory } from '../../features/fields/classifyHistory'
import { stageForAge, stages } from '../../features/fields/growthStage'
import { AGE_BUCKET_DAYS, orderPlotTypes, plotTypeColor } from '../../features/fields/plotTypeStyle'
import { seasonLabelForYear, seasonStartYearFor } from '../../features/fields/season'
import type { Field, FieldGeo } from '../../features/fields/types'
import { downloadChartExcel, downloadChartPNG, printChartAsPDF } from '../../lib/exportUtils'
import { buildStageBands, stageBandsPlugin } from '../../lib/stageBandsPlugin'
import { ExportButtonRow } from './ExportButtonRow'

interface NdviTrendViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  /** Selected Plant Season years from the sidebar filter — 2+ enables the
   * "Plant Season (YoY)" grouping mode. */
  seasons: string[]
}

type GroupBy = 'plotType' | 'season'

const SEASON_COLORS = ['#15803D', '#2563EB', '#DB2777', '#7C3AED', '#EA580C', '#0D9488']

function seasonColor(index: number): string {
  return SEASON_COLORS[index % SEASON_COLORS.length]
}

/** NDVI Trend tab — averaged NDVI-vs-age curves, grouped either by
 * crop-cycle Plot Type (Plant vs Ratoon, the default — RS_Cane_Monitoring_S1.html
 * `renderChartByType()` :5508-5610) or, once 2+ seasons are picked in the
 * sidebar's Plant Season filter, by season instead — a new grouping mode
 * (not in the source app, which never had a YoY option on this specific
 * chart) reusing the exact same age-bucketing/averaging approach. Never one
 * line per individual plot — unreadable clutter at 400+ fields. */
export function NdviTrendView({ fields, geoByCode, seasons }: NdviTrendViewProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const chartRef = useRef<ChartInstance<'line'> | null>(null)
  const seasonModeEnabled = seasons.length >= 2
  const [groupBy, setGroupBy] = useState<GroupBy>('plotType')
  const bySeason = groupBy === 'season' && seasonModeEnabled

  const { datasets, legend, activeStages, hasData } = useMemo(() => {
    const buckets: Record<string, Record<number, { sum: number; count: number }>> = {}
    const activeStageNames = new Set<string>()

    for (const field of fields) {
      const groupKey = bySeason ? seasonYearKey(field) : field.type
      if (!groupKey) continue
      const rows = classifyHistory(field, geoByCode[field.code])
      for (const row of rows) {
        if (row.isS1) continue
        const b = Math.floor(row.age / AGE_BUCKET_DAYS)
        buckets[groupKey] ??= {}
        buckets[groupKey][b] ??= { sum: 0, count: 0 }
        buckets[groupKey][b].sum += row.ndvi
        buckets[groupKey][b].count += 1
        const sf = stageForAge(row.age)
        if (sf) activeStageNames.add(sf.stage.name)
      }
    }

    const orderedKeys = bySeason
      ? Object.keys(buckets)
          .map(Number)
          .sort((a, b) => a - b)
          .map(String)
      : orderPlotTypes(Object.keys(buckets))

    const datasets = orderedKeys.map((key, i) => {
      const bkts = buckets[key]
      const ageKeys = Object.keys(bkts)
        .map(Number)
        .sort((a, b) => a - b)
      const color = bySeason ? seasonColor(i) : plotTypeColor(key)
      return {
        label: bySeason ? seasonLabelForYear(Number(key)) : key,
        data: ageKeys.map((b) => ({
          x: b * AGE_BUCKET_DAYS + AGE_BUCKET_DAYS / 2,
          y: Number((bkts[b].sum / bkts[b].count).toFixed(3)),
          n: bkts[b].count,
        })),
        borderColor: color,
        backgroundColor: `${color}22`,
        pointBackgroundColor: color,
        pointBorderColor: color,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        fill: false,
        hidden: hiddenKeys.has(key),
      }
    })

    const legend = orderedKeys.map((key, i) => ({
      key,
      label: bySeason ? seasonLabelForYear(Number(key)) : key,
      color: bySeason ? seasonColor(i) : plotTypeColor(key),
      plotCount: new Set(
        fields.filter((f) => (bySeason ? seasonYearKey(f) === key : f.type === key)).map((f) => f.code),
      ).size,
    }))

    const activeStages = stages.filter((s) => activeStageNames.has(s.name))

    return { datasets, legend, activeStages, hasData: orderedKeys.length > 0 }
  }, [fields, geoByCode, hiddenKeys, bySeason])

  const thresholdDatasets = useMemo(
    () =>
      activeStages.flatMap((s, i) => {
        const dayMin = i === 0 ? 0 : activeStages[i - 1].cumEnd
        const dayMax = s.cumEnd
        const common = {
          borderColor: 'rgba(107,114,128,0.45)',
          borderWidth: 1.5,
          borderDash: [6, 4] as [number, number],
          pointRadius: 0,
          fill: false,
          tension: 0,
          label: `_t_${s.name}`,
        }
        return [
          { ...common, data: [{ x: dayMin, y: s.tMin }, { x: dayMax, y: s.tMin }] },
          { ...common, data: [{ x: dayMin, y: s.tMax }, { x: dayMax, y: s.tMax }] },
        ]
      }),
    [activeStages],
  )

  const stageBands = useMemo(() => buildStageBands(activeStages), [activeStages])

  const toggleKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  if (!hasData) {
    return (
      <div className="p-10 text-center text-sm text-neutral-400">
        {bySeason ? 'No NDVI data available for the selected seasons.' : 'No Plot Type data available for the selected plots.'}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-700">NDVI trend — age in days after planting</div>
          <div className="text-xs text-neutral-400">
            Dotted band = stage NDVI threshold · click a legend item to hide/show it
          </div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-neutral-200">
          <button
            type="button"
            onClick={() => setGroupBy('plotType')}
            className={`px-3 py-1.5 text-xs font-medium ${groupBy === 'plotType' ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
          >
            Plot Type
          </button>
          <button
            type="button"
            onClick={() => setGroupBy('season')}
            disabled={!seasonModeEnabled}
            title={!seasonModeEnabled ? 'Select 2+ seasons in the Plant Season filter (sidebar) to enable' : undefined}
            className={`px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${groupBy === 'season' ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
          >
            Plant Season (YoY)
          </button>
        </div>
      </div>

      <div className="mb-3 flex justify-end">
        <ExportButtonRow
          onPNG={() => downloadChartPNG(chartRef.current, 'NDVI_trend')}
          onPDF={() => printChartAsPDF(chartRef.current, 'NDVI Trend')}
          onExcel={() => downloadChartExcel(chartRef.current, 'NDVI_trend')}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        {legend.map((l) => {
          const isHidden = hiddenKeys.has(l.key)
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => toggleKey(l.key)}
              className={`flex items-center gap-1.5 text-xs ${isHidden ? 'text-neutral-400 line-through' : 'text-neutral-600'}`}
            >
              <span
                className="inline-block h-2.5 w-3.5 rounded-sm"
                style={{ backgroundColor: isHidden ? '#d1d5db' : l.color }}
              />
              {l.label} ({l.plotCount} plots)
            </button>
          )
        })}
      </div>

      <div style={{ height: 400 }}>
        <Line
          ref={chartRef}
          data={{ datasets: [...datasets, ...thresholdDatasets] }}
          plugins={[stageBandsPlugin]}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              // Chart.js's own legend is disabled — the clickable HTML
              // legend built above the chart already covers this, and
              // showing both was rendering the threshold-band helper
              // datasets ("_t_Germination" etc.) as a second, unfiltered
              // legend row underneath it.
              legend: { display: false },
              tooltip: {
                filter: (item) => !String(item.dataset.label).startsWith('_t'),
                callbacks: {
                  title: (items) => `Crop age: ~${items[0].parsed.x} days`,
                  label: (item) => {
                    const raw = item.dataset.data[item.dataIndex] as unknown as { n: number }
                    return `${item.dataset.label}: avg NDVI ${(item.parsed.y as number).toFixed(3)} (n=${raw.n} obs)`
                  },
                },
              },
              stageBands: { bands: stageBands },
            },
            scales: {
              x: {
                type: 'linear',
                title: { display: true, text: 'Crop age (days after planting)' },
                ticks: { stepSize: 30 },
              },
              y: {
                min: 0,
                max: 1,
                title: { display: true, text: 'Average NDVI' },
                ticks: { stepSize: 0.1 },
              },
            },
          }}
        />
      </div>
    </div>
  )
}

function seasonYearKey(field: Field): string | null {
  const y = seasonStartYearFor(field.plantDateRaw)
  return y === null ? null : String(y)
}
