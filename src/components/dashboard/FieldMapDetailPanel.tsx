import { HEALTH_BADGE_CLASS, HEALTH_LABEL } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { GrowthStageTimeline } from './GrowthStageTimeline'
import { NdviSparkline } from './NdviSparkline'

interface FieldMapDetailPanelProps {
  field: Field
  geo: FieldGeo
  onClose: () => void
  onOpenTrend: () => void
}

const WATCH_THRESHOLD = 0.1

/** Side panel shown when a field is selected on the map — ports the field
 * detail bottom sheet's content (Flutter `_FieldDetailSheet`,
 * 000_A_FarmSignal_APP_new.html `showFieldDetailPanel()` :4102-4203), laid
 * out as a fixed right-side panel (more screen space on desktop than a
 * mobile bottom sheet). No Navigate/Scout/View-Details buttons — see plan. */
export function FieldMapDetailPanel({ field, geo, onClose, onOpenTrend }: FieldMapDetailPanelProps) {
  const hasPixelData = geo.pixelDist.good + geo.pixelDist.optimal + geo.pixelDist.attention > 0
  const drop = geo.prevNdvi != null && geo.ndvi != null ? Number((geo.prevNdvi - geo.ndvi).toFixed(2)) : null

  return (
    <div className="absolute inset-y-0 right-0 z-[1100] w-80 overflow-y-auto bg-white shadow-xl">
      <div className="flex items-start justify-between gap-2 border-b border-neutral-100 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-neutral-800">{field.name}</div>
          <div className="text-xs text-neutral-400">{field.code}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HEALTH_BADGE_CLASS[field.healthStatus]}`}>
            {HEALTH_LABEL[field.healthStatus]}
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {geo.pngUrl && (
          <img
            src={geo.pngUrl}
            alt="NDVI mosaic"
            className="max-h-40 w-full rounded-lg bg-[#F7F5F0] object-contain"
          />
        )}

        {drop !== null && drop >= WATCH_THRESHOLD && (
          <div className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
            WATCH ▼ {drop} ({geo.prevNdvi!.toFixed(2)} → {geo.ndvi!.toFixed(2)})
          </div>
        )}
        {drop !== null && drop < 0 && (
          <div className="rounded-md bg-green-50 px-2 py-1.5 text-[11px] font-semibold text-green-700">
            Improving ▲ {Math.abs(drop)}
          </div>
        )}

        <div className="text-xs font-semibold text-neutral-700">
          {geo.ndvi != null
            ? `${geo.growthStage} · Day ${geo.growthDays} · NDVI ${geo.ndvi.toFixed(2)}`
            : geo.growthStage || 'No NDVI data loaded for this plot'}
        </div>

        {geo.stageData.length > 0 && <GrowthStageTimeline geo={geo} />}

        {hasPixelData && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase text-neutral-400">Pixel distribution</div>
            <div className="flex h-2 overflow-hidden rounded">
              <div style={{ width: `${geo.pixelDist.good}%`, backgroundColor: '#22A65A' }} />
              <div style={{ width: `${geo.pixelDist.optimal}%`, backgroundColor: '#F59E0B' }} />
              <div style={{ width: `${geo.pixelDist.attention}%`, backgroundColor: '#DC2626' }} />
            </div>
            <div className="mt-1 text-[10px] text-neutral-500">
              Good {Math.round(geo.pixelDist.good)}% · Moderate {Math.round(geo.pixelDist.optimal)}% · Attention{' '}
              {Math.round(geo.pixelDist.attention)}%
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <MetaItem label="Village" value={field.village} />
          <MetaItem label="Area" value={field.area ? `${field.area} Ac` : ''} />
          <MetaItem label="Type" value={field.type} />
          <MetaItem label="Variety" value={field.variety} />
          <MetaItem label="Planted" value={field.date} />
        </div>

        <button
          type="button"
          onClick={onOpenTrend}
          className="w-full rounded-md border border-neutral-100 bg-neutral-50 py-1 hover:border-neutral-200"
          title="Open full NDVI trend"
        >
          <NdviSparkline field={field} geo={geo} height={40} />
        </button>
      </div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F7F5F0] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="truncate text-[11px] font-semibold text-neutral-700">{value || '—'}</div>
    </div>
  )
}
