import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { classifyHistory } from '../../features/fields/classifyHistory'
import type { Field, FieldGeo } from '../../features/fields/types'

interface NdviSparklineProps {
  field: Field
  geo: FieldGeo | undefined
  height?: number
}

/** Minimal NDVI-vs-age mini chart (no axes/legend/tooltip chrome) — used on
 * Field Cards and the Field Map detail panel, both of which open
 * NdviTrendModal for the full single-plot chart on click. */
export function NdviSparkline({ field, geo, height = 36 }: NdviSparklineProps) {
  const rows = useMemo(() => classifyHistory(field, geo).filter((r) => !r.isS1), [field, geo])

  if (rows.length < 2) {
    return <div className="py-2.5 text-center text-[9px] text-neutral-400">View trend</div>
  }

  return (
    <div style={{ height }}>
      <Line
        data={{
          datasets: [
            {
              data: rows.map((r) => ({ x: r.age, y: r.ndvi })),
              borderColor: '#1D9E75',
              backgroundColor: '#1D9E7520',
              pointRadius: 0,
              tension: 0.3,
              borderWidth: 1.5,
              fill: true,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: { x: { type: 'linear', display: false }, y: { display: false, min: 0, max: 1 } },
          plugins: { tooltip: { enabled: false } },
          elements: { point: { hoverRadius: 0 } },
        }}
      />
    </div>
  )
}
