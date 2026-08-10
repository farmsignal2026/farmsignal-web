/** Same 20-stop brown->teal ramp as NDMI_RAMP in ndmi_manual_pipeline.py —
 * if that script's ramp ever changes, this needs updating to match, it's
 * not derived from one shared source. Dry (brown) -> wet (teal), over the
 * same -0.5..0.5 display range the raster pipeline renders against.
 * Deliberately a different color family from NdviRampLegend's red-yellow-
 * green ramp so the two are never visually confused. */
const NDMI_RAMP: [number, number, number][] = [
  [84, 48, 5],
  [102, 61, 8],
  [120, 75, 12],
  [140, 90, 18],
  [160, 105, 30],
  [180, 122, 48],
  [196, 143, 76],
  [212, 165, 107],
  [224, 186, 138],
  [235, 205, 168],
  [243, 224, 200],
  [230, 236, 227],
  [203, 229, 220],
  [170, 220, 208],
  [133, 208, 191],
  [97, 190, 171],
  [66, 168, 149],
  [40, 143, 126],
  [19, 116, 103],
  [0, 90, 80],
]
export const NDMI_RAMP_CSS = `linear-gradient(to right, ${NDMI_RAMP.map(
  ([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / (NDMI_RAMP.length - 1)) * 100).toFixed(1)}%`,
).join(', ')})`

interface NdmiRampLegendProps {
  compact?: boolean
}

export function NdmiRampLegend({ compact = false }: NdmiRampLegendProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
      <span className="whitespace-nowrap text-[10px] font-semibold text-neutral-500">🎨 NDMI range:</span>
      <div className={`flex flex-1 flex-col gap-0.5 ${compact ? '' : 'max-w-[320px]'}`}>
        <div className="h-3.5 rounded border border-neutral-200" style={{ background: NDMI_RAMP_CSS }} />
        <div className="flex justify-between font-mono text-[9px] text-neutral-400">
          {['-0.5', '-0.25', '0.0', '0.25', '0.5'].map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
      </div>
      {!compact && <span className="whitespace-nowrap text-[9px] text-neutral-400">(brown=dry → teal=wet)</span>}
    </div>
  )
}
