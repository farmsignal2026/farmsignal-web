import { useEffect, useMemo, useState } from 'react'
import type { RasterHistoryEntry } from '../../features/fields/types'
import type { Metric } from './MetricToggle'

interface NdviMapHistoryProps {
  rasterHistory: RasterHistoryEntry[]
  /** Which index's image/value to browse — NDVI (default) or NDMI. Both
   * live on the same rows (see RasterHistoryEntry), so switching metric
   * just picks a different url/value pair per frame, not a different
   * history array. */
  metric?: Metric
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Browsable satellite/NDVI raster history — ports the source HTML's
 * `openNdviModal()`/Prev-Next frame browser (RS_Cane_Monitoring_S1.html:
 * 8359-8406). Sourced from `ndvi_raster` (its own table, own per-date
 * history — see NDVI_Data_Model_Split_Migration_Plan.docx), not the trend
 * table. Only ever shows captures that actually have a surviving image —
 * this is specifically a photo browser; the "latest, even without a
 * picture" case is handled by the caller showing `FieldGeo.pngDate`
 * directly, not by this component. Defaults to the newest frame. */
export function NdviMapHistory({ rasterHistory, metric = 'ndvi' }: NdviMapHistoryProps) {
  const frames = useMemo(
    () => rasterHistory.filter((h) => (metric === 'ndvi' ? h.pngUrl !== null : h.ndmiPngUrl !== null)),
    [rasterHistory, metric],
  )
  const [idx, setIdx] = useState(frames.length - 1)

  // Reset to "latest" whenever the underlying field/history/metric changes
  // — without this, switching between fields while this component stays
  // mounted (e.g. clicking a different marker on the map), or toggling
  // NDVI/NDMI, would keep showing whatever frame index was last browsed to.
  useEffect(() => {
    setIdx(frames.length - 1)
  }, [frames])

  if (frames.length === 0) return null
  const safeIdx = Math.min(Math.max(idx, 0), frames.length - 1)
  const frame = frames[safeIdx]
  const imgUrl = metric === 'ndvi' ? frame.pngUrl : frame.ndmiPngUrl
  const value = metric === 'ndvi' ? frame.ndvi : frame.ndmi
  // Rows created by the Storage backfill (an image found with no matching
  // Pixel Excel entry for that date) have null pixel-class stats in the
  // database — which pixelDist represents as all-zero, same convention as
  // FieldGeo.pixelDist elsewhere (see hasPixelData in FieldMapDetailPanel.tsx).
  // Showing "Good 0% · Moderate 0% · Attention 0%" for that case reads as
  // real data (impossible — real percentages sum to ~100%), not "no data,"
  // so it's called out explicitly instead. NDMI has no pixel classification
  // at all yet (thresholds not decided), so it never shows this line.
  const hasPixelData = metric === 'ndvi' && frame.pixelDist.good + frame.pixelDist.optimal + frame.pixelDist.attention > 0

  return (
    <div>
      <img
        src={imgUrl!}
        alt={metric === 'ndvi' ? 'NDVI satellite map' : 'NDMI moisture map'}
        className="max-h-56 w-full rounded-lg bg-[#F7F5F0] object-contain"
      />
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          {formatDate(frame.date)} · {metric.toUpperCase()} {value != null ? value.toFixed(2) : '—'}
          {hasPixelData
            ? ` · Good ${Math.round(frame.pixelDist.good)}% · Moderate ${Math.round(frame.pixelDist.optimal)}% · Attention ${Math.round(frame.pixelDist.attention)}%`
            : metric === 'ndvi'
              ? ' · No classification data for this date'
              : ''}
        </span>
        {frames.length > 1 && (
          <span className="shrink-0 text-neutral-400">
            {safeIdx + 1} of {frames.length}
          </span>
        )}
      </div>
      {frames.length > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={safeIdx <= 0}
            onClick={() => setIdx(safeIdx - 1)}
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            ← Older
          </button>
          <button
            type="button"
            disabled={safeIdx >= frames.length - 1}
            onClick={() => setIdx(safeIdx + 1)}
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            Newer →
          </button>
        </div>
      )}
    </div>
  )
}
