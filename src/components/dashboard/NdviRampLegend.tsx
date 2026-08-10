/** Exact same 20-level RYG ramp as NDVI_RAMP in RS_Cane_Monitoring_S1.html
 * (:4359) — if that script's ramp ever changes, this needs updating to
 * match, it's not derived from one shared source. Low (red) -> high
 * (green), each stop a fixed 0.05-wide NDVI band. Extracted from
 * FieldMapView.tsx so the same legend can sit under any raster PNG, not
 * just the Field Map — per explicit user request, since the color scale
 * is meaningless without it wherever else a raster image is shown. */
const NDVI_RAMP: [number, number, number][] = [
  [139, 0, 0],
  [180, 0, 0],
  [210, 30, 0],
  [230, 60, 0],
  [240, 100, 0],
  [245, 130, 0],
  [245, 160, 0],
  [240, 190, 0],
  [225, 215, 0],
  [195, 220, 0],
  [160, 210, 10],
  [120, 200, 15],
  [75, 185, 20],
  [45, 165, 18],
  [25, 145, 15],
  [15, 125, 12],
  [8, 105, 10],
  [5, 85, 8],
  [3, 65, 5],
  [1, 45, 3],
]
export const NDVI_RAMP_CSS = `linear-gradient(to right, ${NDVI_RAMP.map(
  ([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / (NDVI_RAMP.length - 1)) * 100).toFixed(1)}%`,
).join(', ')})`

interface NdviRampLegendProps {
  /** Field Map's own version uses a max-w wrapper + trailing hint text;
   * callers rendering this under a smaller raster thumbnail (e.g.
   * NdviMapHistory) can drop those via `compact`. */
  compact?: boolean
}

export function NdviRampLegend({ compact = false }: NdviRampLegendProps) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 ${compact ? '' : ''}`}>
      <span className="whitespace-nowrap text-[10px] font-semibold text-neutral-500">🎨 NDVI range:</span>
      <div className={`flex flex-1 flex-col gap-0.5 ${compact ? '' : 'max-w-[320px]'}`}>
        <div className="h-3.5 rounded border border-neutral-200" style={{ background: NDVI_RAMP_CSS }} />
        <div className="flex justify-between font-mono text-[9px] text-neutral-400">
          {Array.from({ length: 11 }, (_, i) => (i / 10).toFixed(1)).map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
      </div>
      {!compact && <span className="whitespace-nowrap text-[9px] text-neutral-400">(red=low → green=high)</span>}
    </div>
  )
}
