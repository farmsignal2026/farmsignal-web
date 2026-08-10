import type { FieldGeo } from '../../features/fields/types'
import type { Metric } from './MetricToggle'
import { NdviMapHistory } from './NdviMapHistory'

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Single unified image viewer for FieldDetailModal/FieldMapDetailPanel's
 * Satellite Map section — just NdviMapHistory, always shown, defaulting to
 * the latest frame with its own Prev/Next arrows built in. Replaces the
 * earlier "static current image + separate toggle revealing a second,
 * visually duplicate image block underneath" layout, which read as two
 * stacked windows showing the same latest frame twice — per explicit user
 * feedback (2026-08-09). Still preserves the earlier "even with no
 * surviving image, show the latest date" guarantee: if the true latest
 * capture has no picture but an older one does, a one-line note says so
 * instead of silently only ever showing the older date. */
export function SatelliteMapViewer({ geo, metric }: { geo: FieldGeo; metric: Metric }) {
  const hasFrame =
    metric === 'ndvi' ? geo.rasterHistory.some((r) => r.pngUrl !== null) : geo.rasterHistory.some((r) => r.ndmiPngUrl !== null)
  const latestHasImage = metric === 'ndvi' ? geo.pngUrl !== null : geo.ndmiPngUrl !== null

  if (!hasFrame) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg bg-[#F7F5F0] text-[11px] text-neutral-400">
        {metric === 'ndvi' ? 'No image on file for this date' : 'No NDMI image for this date'}
      </div>
    )
  }

  return (
    <div>
      {!latestHasImage && geo.pngDate && (
        <div className="mb-1.5 text-[10px] text-neutral-400">
          Latest capture ({formatDate(geo.pngDate)}) has no surviving image — showing the most recent available.
        </div>
      )}
      <NdviMapHistory rasterHistory={geo.rasterHistory} metric={metric} />
    </div>
  )
}
