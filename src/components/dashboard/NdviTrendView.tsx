import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { classifyHistory } from '../../features/fields/classifyHistory'
import { stageForAge, stages } from '../../features/fields/growthStage'
import { AGE_BUCKET_DAYS, orderPlotTypes, plotTypeColor } from '../../features/fields/plotTypeStyle'
import type { Field, FieldGeo } from '../../features/fields/types'
import { buildStageBands, stageBandsPlugin } from '../../lib/stageBandsPlugin'

interface NdviTrendViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
}

/** NDVI Trend tab — Plant vs Ratoon grouped view only (per user decision):
 * one averaged NDVI-vs-age curve per crop-cycle type, not one line per
 * plot (which would be unreadable clutter at 400+ fields). Ports
 * `renderChartByType()` (RS_Cane_Monitoring_S1.html:5508-5610). Legend
 * items are click-to-hide/unhide (ports `toggleChartType()`, :5636-5658). */
export function NdviTrendView({ fields, geoByCode }: NdviTrendViewProps) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  const { datasets, legend, activeStages, hasData } = useMemo(() => {
    const buckets: Record<string, Record<number, { sum: number; count: number }>> = {}
    const activeStageNames = new Set<string>()

    for (const field of fields) {
      const plotType = field.type
      if (!plotType) continue
      const rows = classifyHistory(field, geoByCode[field.code])
      for (const row of rows) {
        if (row.isS1) continue
        const b = Math.floor(row.age / AGE_BUCKET_DAYS)
        buckets[plotType] ??= {}
        buckets[plotType][b] ??= { sum: 0, count: 0 }
        buckets[plotType][b].sum += row.ndvi
        buckets[plotType][b].count += 1
        const sf = stageForAge(row.age)
        if (sf) activeStageNames.add(sf.stage.name)
      }
    }

    const orderedTypes = orderPlotTypes(Object.keys(buckets))

    const datasets = orderedTypes.map((pt) => {
      const bkts = buckets[pt]
      const ageKeys = Object.keys(bkts)
        .map(Number)
        .sort((a, b) => a - b)
      const color = plotTypeColor(pt)
      return {
        label: pt,
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
        hidden: hiddenTypes.has(pt),
      }
    })

    const legend = orderedTypes.map((pt) => ({
      plotType: pt,
      color: plotTypeColor(pt),
      plotCount: new Set(fields.filter((f) => f.type === pt).map((f) => f.code)).size,
    }))

    const activeStages = stages.filter((s) => activeStageNames.has(s.name))

    return { datasets, legend, activeStages, hasData: orderedTypes.length > 0 }
  }, [fields, geoByCode, hiddenTypes])

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

  const toggleType = (pt: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (!next.delete(pt)) next.add(pt)
      return next
    })
  }

  if (!hasData) {
    return (
      <div className="p-10 text-center text-sm text-neutral-400">
        No Plot Type data available for the selected plots.
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-1 text-sm font-semibold text-neutral-700">NDVI trend — age in days after planting</div>
      <div className="mb-3 text-xs text-neutral-400">
        Dotted band = stage NDVI threshold · one averaged line per crop-cycle type (Plant/Ratoon) · click a legend
        item to hide/show it
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        {legend.map((l) => {
          const isHidden = hiddenTypes.has(l.plotType)
          return (
            <button
              key={l.plotType}
              type="button"
              onClick={() => toggleType(l.plotType)}
              className={`flex items-center gap-1.5 text-xs ${isHidden ? 'text-neutral-400 line-through' : 'text-neutral-600'}`}
            >
              <span
                className="inline-block h-2.5 w-3.5 rounded-sm"
                style={{ backgroundColor: isHidden ? '#d1d5db' : l.color }}
              />
              {l.plotType} ({l.plotCount} plots)
            </button>
          )
        })}
      </div>

      <div style={{ height: 400 }}>
        <Line
          data={{ datasets: [...datasets, ...thresholdDatasets] }}
          plugins={[stageBandsPlugin]}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
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
