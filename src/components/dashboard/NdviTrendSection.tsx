import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { classifyHistory, type ClassifiedObservation } from '../../features/fields/classifyHistory'
import { stageForAge, stages } from '../../features/fields/growthStage'
import { HEALTH_COLOR_HEX, HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { buildStageBands, stageBandsPlugin } from '../../lib/stageBandsPlugin'

interface NdviTrendSectionProps {
  field: Field
  geo: FieldGeo | undefined
}

const S1_COLOR = '#f59e0b'
const UNCONFIRMED_BORDER = '#9ca3af'

/** A point's marker shape/color — three distinct visual states the source
 * legend calls out (S1 estimated vs. sharp-drop-unconfirmed were both
 * flattened into one grey dot before; the underlying `isS1`/
 * `isLowConfidence` flags were already there on `ClassifiedObservation`,
 * just never rendered differently). `isS1` takes priority over
 * `isLowConfidence` since a satellite-source gap-fill point is the more
 * specific case. */
function pointStyleFor(p: ClassifiedObservation): { style: 'triangle' | 'circle'; bg: string; border: string; borderWidth: number } {
  if (p.isS1) return { style: 'triangle', bg: S1_COLOR, border: S1_COLOR, borderWidth: 0 }
  if (p.isLowConfidence) return { style: 'circle', bg: '#ffffff', border: UNCONFIRMED_BORDER, borderWidth: 1.5 }
  return { style: 'circle', bg: HEALTH_COLOR_HEX[p.status], border: HEALTH_COLOR_HEX[p.status], borderWidth: 0 }
}

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
          {stats.unconfirmed} reading{stats.unconfirmed === 1 ? '' : 's'} not yet confirmed (S1 gap-fill or a sharp
          drop awaiting the next pass) — see markers below, excluded from the counts above.
        </div>
      )}

      <ChartLegend />
      <div className="mb-2 text-[10px] text-neutral-400">
        Dotted lines = stage threshold range · Point colour/shape = observation status
      </div>

      <div style={{ height: 320 }}>
        <Line
          data={{
            datasets: [
              {
                label: field.code,
                data: points.map((p) => ({ x: p.age, y: Number(p.ndvi.toFixed(3)) })),
                borderColor: '#1D9E75',
                backgroundColor: '#1D9E7525',
                pointStyle: points.map((p) => pointStyleFor(p).style),
                pointBackgroundColor: points.map((p) => pointStyleFor(p).bg),
                pointBorderColor: points.map((p) => pointStyleFor(p).border),
                pointBorderWidth: points.map((p) => pointStyleFor(p).borderWidth),
                // A segment touching an S1/low-confidence point at either
                // end is drawn dashed rather than solid — the connecting
                // line itself is only as trustworthy as its shakiest
                // endpoint, same convention as the source HTML chart.
                segment: {
                  borderDash: (ctx) => (points[ctx.p0DataIndex]?.isUnconfirmed || points[ctx.p1DataIndex]?.isUnconfirmed ? [4, 4] : undefined),
                },
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
              legend: { display: false },
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

/** Static top legend, ported from the source HTML's own legend row rather
 * than Chart.js's dataset-driven one (which only ever had one real line
 * dataset here, plus hidden `_t_`-prefixed threshold lines — not useful for
 * explaining what the point colors/shapes mean). Distinguishes S1 gap-fill
 * points (triangle) from sharp-drop-awaiting-confirmation points (hollow
 * circle), per user request — both used to render as the same grey dot. */
function ChartLegend() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-600">
      <LegendItem shape="square" color={HEALTH_COLOR_HEX.good} label="Good" />
      <LegendItem shape="square" color={HEALTH_COLOR_HEX.optimal} label="Moderate" />
      <LegendItem shape="square" color={HEALTH_COLOR_HEX.attention} label="Need attention" />
      <LegendItem shape="dashed-line" color="#6b7280" label="Stage threshold" />
      <LegendItem shape="triangle" color={S1_COLOR} label="S1 estimated (cloud gap >7 days)" />
      <LegendItem shape="circle-hollow" color={UNCONFIRMED_BORDER} label="Unconfirmed (sharp drop, awaiting next pass)" />
    </div>
  )
}

function LegendItem({
  shape,
  color,
  label,
}: {
  shape: 'square' | 'triangle' | 'circle-hollow' | 'dashed-line'
  color: string
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <LegendSwatch shape={shape} color={color} />
      {label}
    </div>
  )
}

function LegendSwatch({ shape, color }: { shape: 'square' | 'triangle' | 'circle-hollow' | 'dashed-line'; color: string }) {
  if (shape === 'square') {
    return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
  }
  if (shape === 'dashed-line') {
    return <span className="inline-block h-0 w-4 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} />
  }
  if (shape === 'circle-hollow') {
    return (
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-white"
        style={{ border: `1.5px solid ${color}` }}
      />
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <polygon points="5,0 10,10 0,10" fill={color} />
    </svg>
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
