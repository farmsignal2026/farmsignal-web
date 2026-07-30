import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polygon, ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { HEALTH_COLOR_HEX } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { FieldDetailModal } from './FieldDetailModal'
import { FieldMapDetailPanel } from './FieldMapDetailPanel'

const ZOOM_THRESHOLD = 16
const RASTER_BUF_DEG = 0.0003
const DEFAULT_CENTER: [number, number] = [10.875, 78.855]
const DEFAULT_ZOOM = 13

/** Exact same 20-level RYG ramp as NDVI_RAMP in RS_Cane_Monitoring_S1.html
 * (:4359) — if that script's ramp ever changes, this needs updating to
 * match, it's not derived from one shared source. Low (red) -> high
 * (green), each stop a fixed 0.05-wide NDVI band. */
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
const NDVI_RAMP_CSS = `linear-gradient(to right, ${NDVI_RAMP.map(
  ([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / (NDVI_RAMP.length - 1)) * 100).toFixed(1)}%`,
).join(', ')})`

const ESRI_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const CARTO_STREET_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

interface MappedField {
  field: Field
  geo: FieldGeo
  centroid: [number, number]
  polygon: [number, number][]
}

interface FieldMapViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  /** When set, the map opens centered on this field at zoom 17 instead of
   * fitting all mapped fields — matches Flutter map_screen.dart's own
   * `focusPlotCode` handling (initial view only; the detail panel doesn't
   * auto-open, same as Flutter — the user still clicks the marker). */
  focusPlotCode?: string | null
}

/** Field Map tab — react-leaflet, mirroring the already-verified Flutter
 * map screen (farmsignal_flutter/lib/features/map/presentation/map_screen.dart):
 * satellite/street toggle, zoom-dependent layers (colored dots below zoom
 * 16, real polygons + NDVI mosaic overlays at/above it), click-to-select
 * detail panel. No Navigate button — not a fit for this desk-based
 * dashboard; Scout/photo history is one click away via the unified Field
 * Detail modal instead (see plan). */
export function FieldMapView({ fields, geoByCode, focusPlotCode }: FieldMapViewProps) {
  const [satellite, setSatellite] = useState(true)
  const focusGeo = focusPlotCode ? geoByCode[focusPlotCode] : undefined
  const [zoom, setZoom] = useState(focusGeo?.centroid ? 17 : DEFAULT_ZOOM)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [detailCode, setDetailCode] = useState<string | null>(null)

  const mappedFields = useMemo<MappedField[]>(() => {
    const result: MappedField[] = []
    for (const field of fields) {
      const geo = geoByCode[field.code]
      if (geo?.centroid && geo?.polygon) {
        result.push({ field, geo, centroid: geo.centroid, polygon: geo.polygon })
      }
    }
    return result
  }, [fields, geoByCode])

  const selected = selectedCode ? mappedFields.find((m) => m.field.code === selectedCode) : undefined

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-[11px]">
        {(
          [
            ['good', 'Good'],
            ['optimal', 'Moderate'],
            ['attention', 'Need Attention'],
            ['serious', 'Serious'],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: HEALTH_COLOR_HEX[key] }} />
            {label}
          </span>
        ))}
      </div>

      <div className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
        <span className="whitespace-nowrap text-[10px] font-semibold text-neutral-500">🎨 NDVI range:</span>
        <div className="flex max-w-[320px] flex-1 flex-col gap-0.5">
          <div className="h-3.5 rounded border border-neutral-200" style={{ background: NDVI_RAMP_CSS }} />
          <div className="flex justify-between font-mono text-[9px] text-neutral-400">
            {Array.from({ length: 11 }, (_, i) => (i / 10).toFixed(1)).map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
        </div>
        <span className="whitespace-nowrap text-[9px] text-neutral-400">(red=low → green=high)</span>
      </div>

      <div className="relative" style={{ height: 560 }}>
        <MapContainer
          center={focusGeo?.centroid ?? DEFAULT_CENTER}
          zoom={focusGeo?.centroid ? 17 : DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          {satellite ? (
            <TileLayer attribution="Tiles &copy; Esri" url={ESRI_SATELLITE_URL} maxZoom={19} />
          ) : (
            <TileLayer attribution="&copy; OpenStreetMap, &copy; CARTO" url={CARTO_STREET_URL} maxZoom={19} />
          )}

          <ZoomTracker onZoomChange={setZoom} />
          {!focusGeo?.centroid && <FitBoundsOnData fields={mappedFields} />}

          {zoom < ZOOM_THRESHOLD &&
            mappedFields.map((m) => (
              <Marker
                key={m.field.code}
                position={m.centroid}
                icon={healthDotIcon(m.field.healthStatus)}
                eventHandlers={{ click: () => setSelectedCode(m.field.code) }}
              />
            ))}

          {zoom >= ZOOM_THRESHOLD &&
            mappedFields.map((m) => (
              <Polygon
                key={m.field.code}
                positions={m.polygon}
                pathOptions={{
                  color: HEALTH_COLOR_HEX[m.field.healthStatus],
                  weight: 2.5,
                  fillColor: HEALTH_COLOR_HEX[m.field.healthStatus],
                  fillOpacity: 0.15,
                }}
                eventHandlers={{ click: () => setSelectedCode(m.field.code) }}
              />
            ))}

          {zoom >= ZOOM_THRESHOLD &&
            mappedFields
              .filter((m) => m.geo.pngUrl)
              .map((m) => (
                <ImageOverlay key={`png-${m.field.code}`} url={m.geo.pngUrl!} bounds={bufferedBounds(m.polygon)} opacity={0.9} />
              ))}
        </MapContainer>

        <button
          type="button"
          onClick={() => setSatellite(!satellite)}
          className="absolute right-2 top-2 z-[1000] rounded-full bg-white px-3 py-1.5 text-[11px] font-medium shadow hover:bg-neutral-50"
        >
          {satellite ? '🗺️ Street map' : '🛰️ Satellite'}
        </button>

        {zoom < ZOOM_THRESHOLD && (
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-[1000] flex justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-white">
              Zoom in to see field boundaries
            </span>
          </div>
        )}

        {selected && (
          <FieldMapDetailPanel
            field={selected.field}
            geo={selected.geo}
            onClose={() => setSelectedCode(null)}
            onOpenDetail={() => setDetailCode(selected.field.code)}
          />
        )}
      </div>

      {detailCode && (
        <FieldDetailModal
          field={mappedFields.find((m) => m.field.code === detailCode)!.field}
          geo={geoByCode[detailCode]}
          onClose={() => setDetailCode(null)}
          onViewOnMap={() => {
            /* already on Field Map — nothing extra to do */
          }}
        />
      )}
    </div>
  )
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  })
  return null
}

function FitBoundsOnData({ fields }: { fields: MappedField[] }) {
  const map = useMap()
  useEffect(() => {
    if (fields.length === 0) return
    const bounds = L.latLngBounds(fields.map((m) => m.centroid))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [fields, map])
  return null
}

function bufferedBounds(polygon: [number, number][]): [[number, number], [number, number]] {
  const lats = polygon.map((p) => p[0])
  const lngs = polygon.map((p) => p[1])
  return [
    [Math.min(...lats) - RASTER_BUF_DEG, Math.min(...lngs) - RASTER_BUF_DEG],
    [Math.max(...lats) + RASTER_BUF_DEG, Math.max(...lngs) + RASTER_BUF_DEG],
  ]
}

/** Ports the source's L.circleMarker sizing (radius 5, i.e. 10px diameter,
 * :4664) — the earlier 16px DivIcon dwarfed the actual plot boundaries at
 * low zoom, per user feedback comparing against the HTML dashboard. */
function healthDotIcon(status: keyof typeof HEALTH_COLOR_HEX): L.DivIcon {
  const color = HEALTH_COLOR_HEX[status]
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color}D9;border:1px solid #374151"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}
