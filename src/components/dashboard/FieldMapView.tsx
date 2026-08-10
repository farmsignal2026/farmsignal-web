import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polygon, ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { HEALTH_COLOR_HEX } from '../../features/fields/badgeStyles'
import type { Field, FieldGeo } from '../../features/fields/types'
import { FieldDetailModal } from './FieldDetailModal'
import { FieldMapDetailPanel } from './FieldMapDetailPanel'
import { NdviRampLegend } from './NdviRampLegend'

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
  /** When set, the map opens centered on this field at zoom 17 instead of
   * fitting all mapped fields — matches Flutter map_screen.dart's own
   * `focusPlotCode` handling (initial view only; the detail panel doesn't
   * auto-open, same as Flutter — the user still clicks the marker). */
  focusPlotCode?: string | null
  includeS1: boolean
}

/** Field Map tab — react-leaflet, mirroring the already-verified Flutter
 * map screen (farmsignal_flutter/lib/features/map/presentation/map_screen.dart):
 * satellite/street toggle, zoom-dependent layers (colored dots below zoom
 * 16, real polygons + NDVI mosaic overlays at/above it), click-to-select
 * detail panel. No Navigate button — not a fit for this desk-based
 * dashboard; Scout/photo history is one click away via the unified Field
 * Detail modal instead (see plan). */
export function FieldMapView({ fields, geoByCode, focusPlotCode, includeS1 }: FieldMapViewProps) {
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
  // Whichever field to draw the highlight ring around — whatever's
  // currently clicked/selected on the map takes priority over the field
  // originally navigated to via "View on Map", so clicking around moves
  // the ring instead of leaving it stuck on the original target.
  const highlightedCode = selectedCode ?? focusPlotCode

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

      <div className="mb-2">
        <NdviRampLegend />
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
                icon={healthDotIcon(m.field.healthStatus, m.field.code === highlightedCode)}
                eventHandlers={{ click: () => setSelectedCode(m.field.code) }}
              />
            ))}

          {/* Highlighted polygon rendered LAST so its ring draws on top of
             any overlapping neighbor — otherwise a field surrounded by
             same-health neighbors was visually indistinguishable from them,
             per explicit user feedback ("fields in surrounding, become
             guess field"). Tracks `highlightedCode` (whichever field is
             currently clicked/selected, falling back to the field Field
             Card's "View on Map" navigated to) rather than staying pinned
             to the original focusPlotCode forever — clicking a different
             field on the map moves the ring, per follow-up feedback. */}
          {zoom >= ZOOM_THRESHOLD &&
            [...mappedFields]
              .sort((a, b) => (a.field.code === highlightedCode ? 1 : 0) - (b.field.code === highlightedCode ? 1 : 0))
              .map((m) => {
                const isFocused = m.field.code === highlightedCode
                return (
                  <Polygon
                    key={m.field.code}
                    positions={m.polygon}
                    pathOptions={
                      isFocused
                        ? { color: '#facc15', weight: 5, fillColor: HEALTH_COLOR_HEX[m.field.healthStatus], fillOpacity: 0.25 }
                        : {
                            color: HEALTH_COLOR_HEX[m.field.healthStatus],
                            weight: 2.5,
                            fillColor: HEALTH_COLOR_HEX[m.field.healthStatus],
                            fillOpacity: 0.15,
                          }
                    }
                    eventHandlers={{ click: () => setSelectedCode(m.field.code) }}
                  />
                )
              })}

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
          includeS1={includeS1}
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
function healthDotIcon(status: keyof typeof HEALTH_COLOR_HEX, isFocused = false): L.DivIcon {
  const color = HEALTH_COLOR_HEX[status]
  if (isFocused) {
    // Same highlight color/idea as the focused Polygon's yellow ring — a
    // wider halo ring around the normal dot, since a bigger dot alone
    // still blends into a cluster of same-health neighbors at low zoom.
    return L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;border-radius:50%;background:#facc1540;border:2px solid #facc15;display:flex;align-items:center;justify-content:center"><div style="width:10px;height:10px;border-radius:50%;background:${color}D9;border:1px solid #374151"></div></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })
  }
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color}D9;border:1px solid #374151"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}
