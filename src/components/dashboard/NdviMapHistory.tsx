import { useEffect, useMemo, useState } from 'react'
import type { NdviHistoryEntry } from '../../features/fields/types'

interface NdviMapHistoryProps {
  history: NdviHistoryEntry[]
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Browsable satellite/NDVI raster history — ports the source HTML's
 * `openNdviModal()`/Prev-Next frame browser (RS_Cane_Monitoring_S1.html:
 * 8359-8406). This port only ever showed the single latest raster
 * (`FieldGeo.pngUrl`); the underlying per-observation data was already
 * there (`NdviHistoryEntry.pngUrl`, populated in `fieldsRepository.ts`
 * from `ndvi_observations.raster_png_url`), just never surfaced past
 * "latest" in the UI. Defaults to the newest frame, same as source. */
export function NdviMapHistory({ history }: NdviMapHistoryProps) {
  const frames = useMemo(() => history.filter((h) => h.pngUrl !== null), [history])
  const [idx, setIdx] = useState(frames.length - 1)

  // Reset to "latest" whenever the underlying field/history changes —
  // without this, switching between fields while this component stays
  // mounted (e.g. clicking a different marker on the map) would keep
  // showing whatever frame index was last browsed to on the PREVIOUS field.
  useEffect(() => {
    setIdx(frames.length - 1)
  }, [frames])

  if (frames.length === 0) return null
  const safeIdx = Math.min(Math.max(idx, 0), frames.length - 1)
  const frame = frames[safeIdx]

  return (
    <div>
      <img
        src={frame.pngUrl!}
        alt="NDVI satellite map"
        className="max-h-56 w-full rounded-lg bg-[#F7F5F0] object-contain"
      />
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          {formatDate(frame.date)} · NDVI {frame.ndvi.toFixed(2)}
          {frame.isS1 ? ' · S1 est' : ''}
        </span>
        {frames.length > 1 && (
          <span className="text-neutral-400">
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
