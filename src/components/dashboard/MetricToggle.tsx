export type Metric = 'ndvi' | 'ndmi'

/** NDVI/NDMI pill switch — shared by the Graph (NdviTrendSection) and
 * Image (Satellite Map / NdviMapHistory) sections wherever a raster or
 * trend view can show either index, per user request (2026-08-09). Kept
 * as one small shared component rather than duplicated JSX since it
 * appears in three places and needs to stay visually consistent. */
export function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  return (
    <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 text-[10px] font-semibold">
      {(['ndvi', 'ndmi'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded px-2 py-0.5 ${
            value === m ? (m === 'ndvi' ? 'bg-green-600 text-white' : 'bg-teal-700 text-white') : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
