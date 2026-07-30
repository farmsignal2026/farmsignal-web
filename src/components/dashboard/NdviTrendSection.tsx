import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { classifyHistory } from '../../features/fields/classifyHistory'
import { stageForAge, stages } from '../../features/fields/growthStage'
import { HEALTH_COLOR_HEX, HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { lineStyleLegendLabels } from '../../lib/chartLegend'
import { buildStageBands, stageBandsPlugin } from '../../lib/stageBandsPlugin'

interface NdviTrendSectionProps {
  field: Field
  geo: FieldGeo | undefined
}

const UNCONFIRMED_COLOR = '#d1d5db'

/** NDVI trend stat row + single-plot chart — the HTML's "Individual plots"
 * chart mode (RS_Cane_Monitoring_S1.html:5400-5495) scoped to one plot,
 * extracted from the old standalone NdviTrendModal so it can be embedded
 * as a section inside FieldDetailModal. */
export function NdviTrendSection({ field, geo }: NdviTrendSectionProps) {
  const { points, activeStages, stats } = useMemo(() => {
    const rows = classifyHistory(field, geo)
    const activeStageNames = new Set<string>()
    let good = 0
    let moderate = 0
    let attention = 0
    let unconfirmed = 0
    rows.forEach((r) => {
      const sf = stageForAge(r.age)
      if (sf) activeStageNames.add(sf.stage.name)
      if (r.isUnconfirmed) {
        unconfirmed++
      } else if (r.status === 'good') {
        good++
      } else if (r.status === 'optimal') {
        moderate++
      } else if (r.status === 'attention') {
        attention++
      }
    })
    return {
      points: rows,
      activeStages: stages.filter((s) => activeStageNames.has(s.name)),
      stats: { total: rows.length, good, moderate, attention, unconfirmed },
    }
  }, [field, geo])

  const thresholdDatasets = activeStages.flatMap((s, i) => {
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
  })

  const stageBands = buildStageBands(activeStages)

  if (points.length === 0) {
    return <div className="p-6 text-center text-sm text-neutral-400">No observation history for this plot.</div>
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="Total obs" value={String(stats.total)} />
        <StatTile label="Current stage" value={geo?.growthStage || 'N/A'} />
        <StatTile
          label="Latest NDVI"
          value={geo?.ndvi != null ? geo.ndvi.toFixed(3) : '—'}
          color={geo ? HEALTH_COLOR_HEX[geo.healthStatus] : undefined}
          sub={geo ? HEALTH_LABEL[geo.healthStatus] : undefined}
        />
        <StatTile label="Good obs" value={String(stats.good)} color={HEALTH_COLOR_HEX.good} />
        <StatTile label="Moderate" value={String(stats.moderate)} color={HEALTH_COLOR_HEX.optimal} />
        <StatTile label="Need attention" value={String(stats.attention)} color={HEALTH_COLOR_HEX.attention} />
      </div>
      {stats.unconfirmed > 0 && (
        <div className="mb-3 text-[10px] text-neutral-400">
          {stats.unconfirmed} unconfirmed reading{stats.unconfirmed === 1 ? '' : 's'} (cloud/S1 gap-fill) shown in
          grey, excluded from the counts above.
        </div>
      )}

      <div style={{ height: 320 }}>
        <Line
          data={{
            datasets: [
              {
                label: field.code,
                data: points.map((p) => ({ x: p.age, y: Number(p.ndvi.toFixed(3)) })),
                borderColor: '#1D9E75',
                backgroundColor: '#1D9E7525',
                pointBackgroundColor: points.map((p) => (p.isUnconfirmed ? UNCONFIRMED_COLOR : HEALTH_COLOR_HEX[p.status])),
                pointBorderWidth: 0,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: false,
                borderWidth: 2,
              },
              ...thresholdDatasets,
            ],
          }}
          plugins={[stageBandsPlugin]}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { boxWidth: 26, boxHeight: 4, font: { size: 11 }, generateLabels: lineStyleLegendLabels },
              },
              tooltip: {
                filter: (item) => !String(item.dataset.label).startsWith('_t'),
                callbacks: {
                  title: (items) => `Crop age: ${items[0].parsed.x} days`,
                  label: (item) => `NDVI ${(item.parsed.y as number).toFixed(3)}`,
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
              y: { min: 0, max: 1, title: { display: true, text: 'NDVI' }, ticks: { stepSize: 0.1 } },
            },
          }}
        />
      </div>
    </div>
  )
}

function StatTile({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-md border border-neutral-100 bg-neutral-50 px-2 py-1.5 text-center">
      <div className="text-sm font-bold" style={{ color: color ?? '#1f2937' }}>
        {value}
      </div>
      <div className="text-[8px] uppercase tracking-wide text-neutral-400">{label}</div>
      {sub && (
        <div className="text-[9px] font-medium" style={{ color: color ?? '#6b7280' }}>
          {sub}
        </div>
      )}
    </div>
  )
}
