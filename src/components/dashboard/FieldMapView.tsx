import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polygon, ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { HEALTH_COLOR_HEX } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { FieldMapDetailPanel } from './FieldMapDetailPanel'
import { NdviTrendModal } from './NdviTrendModal'

const ZOOM_THRESHOLD = 16
const RASTER_BUF_DEG = 0.0003
const DEFAULT_CENTER: [number, number] = [10.875, 78.855]
const DEFAULT_ZOOM = 13

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
}

/** Field Map tab — react-leaflet, mirroring the already-verified Flutter
 * map screen (farmsignal_flutter/lib/features/map/presentation/map_screen.dart):
 * satellite/street toggle, zoom-dependent layers (colored dots below zoom
 * 16, real polygons + NDVI mosaic overlays at/above it), click-to-select
 * detail panel. No Navigate/Scout buttons — not a fit for this desk-based
 * dashboard / no scouting flow exists in this app yet (see plan). */
export function FieldMapView({ fields, geoByCode }: FieldMapViewProps) {
  const [satellite, setSatellite] = useState(true)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [trendCode, setTrendCode] = useState<string | null>(null)

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
    <div className="relative" style={{ height: 600 }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        {satellite ? (
          <TileLayer attribution="Tiles &copy; Esri" url={ESRI_SATELLITE_URL} maxZoom={19} />
        ) : (
          <TileLayer attribution="&copy; OpenStreetMap, &copy; CARTO" url={CARTO_STREET_URL} maxZoom={19} />
        )}

        <ZoomTracker onZoomChange={setZoom} />
        <FitBoundsOnData fields={mappedFields} />

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

      <div className="absolute left-2 top-2 z-[1000] flex items-center gap-3 rounded-full bg-white/90 px-3 py-1.5 text-[11px] shadow">
        {(
          [
            ['good', 'Good'],
            ['optimal', 'Moderate'],
            ['attention', 'Need Attention'],
            ['serious', 'Serious'],
          ] as const
        ).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: HEALTH_COLOR_HEX[key] }} />
            {label}
          </span>
        ))}
      </div>

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
          onOpenTrend={() => setTrendCode(selected.field.code)}
        />
      )}

      {trendCode && (
        <NdviTrendModal
          field={mappedFields.find((m) => m.field.code === trendCode)!.field}
          geo={geoByCode[trendCode]}
          onClose={() => setTrendCode(null)}
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

function healthDotIcon(status: keyof typeof HEALTH_COLOR_HEX): L.DivIcon {
  const color = HEALTH_COLOR_HEX[status]
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}
