import type { HealthStatus } from './growthStage'

/** One row of `v_plots_current`, joined with farmer/factory/division lookups
 * — mirrors the Flutter `Field` domain model (fields/domain/field.dart). */
export interface Field {
  code: string
  name: string
  factory: string
  factoryCode: string
  clientCode: string | null
  division: string
  divisionCode: string
  section: string
  village: string
  area: string
  variety: string
  type: string
  cropType: string
  date: string
  /** Raw planting date, alongside the formatted `date` string — needed for
   * sorting (e.g. Field Cards' "planting date" sort). */
  plantDateRaw: Date | null
  phone: string
  mapped: boolean
  healthStatus: HealthStatus
  farmerCode: string
  needsScout: boolean
}

export interface StagePoint {
  ndvi: number | null
  status: 'good' | 'optimal' | 'attention' | 'future'
  current: boolean
}

export interface PixelDistribution {
  good: number
  optimal: number
  attention: number
}

/** One NDVI satellite pass for a plot, ascending order (oldest first). */
export interface NdviHistoryEntry {
  date: Date
  ndvi: number
  pngUrl: string | null
  isLowConfidence: boolean
  isS1: boolean
}

/** Parallel record to `Field`, keyed by plot code — geometry + NDVI
 * classification detail. Mirrors Flutter's `FieldGeo`. */
export interface FieldGeo {
  code: string
  centroid: [number, number] | null
  polygon: [number, number][] | null
  /** GPS-surveyed acreage from the boundary GeoJSON's own recorded area —
   * more precise than `Field.area` (the Excel-recorded `area_acres`), when
   * available. Null for plots with no boundary survey. */
  gpsAcre: number | null
  ndvi: number | null
  prevNdvi: number | null
  healthStatus: HealthStatus
  growthStage: string
  growthDays: number | null
  thresholdMin: number | null
  thresholdMax: number | null
  pixelDist: PixelDistribution
  stageData: StagePoint[]
  pngUrl: string | null
  /** Consecutive confirmed observations in 'attention', 0 if the field
   * isn't currently in attention/serious. Computed at load time (see
   * fieldsRepository.ts) rather than re-derived from raw history downstream. */
  attentionStreak: number
  history: NdviHistoryEntry[]
}

/** Minimal scout-visit record needed for the needsScout grace-period check. */
export interface ScoutVisit {
  visitDate: Date
  followUpRequired: boolean
  followUpDate: Date | null
}

export interface FieldsLoadResult {
  fields: Field[]
  geoData: FieldGeo[]
  scoutByPlot: Record<string, ScoutVisit[]>
}
