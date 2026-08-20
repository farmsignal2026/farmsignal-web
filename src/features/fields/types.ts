import type { GrowthStage, HealthStatus } from './growthStage'

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
  /** True when this field has NEVER had a real S2 (optical) observation —
   * its classification, if any, comes entirely from S1 (SAR) gap-fill
   * estimates. Excluded by default (Sidebar's "SAR estimate" toggle off),
   * matching source's `includeS1Data` behavior — an S1-only reading isn't
   * accurate enough to treat as real data unless explicitly opted in. */
  s1OnlyData: boolean
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

/** One NDVI trend reading for a plot, ascending order (oldest first).
 * Sourced from `ndvi_trend` — raster/pixel-class data lives separately now
 * (see `RasterHistoryEntry`), not on this row. */
export interface NdviHistoryEntry {
  date: Date
  ndvi: number
  isLowConfidence: boolean
  isS1: boolean
  /** NDMI (moisture index) mean for this same date, when the NDMI trial
   * pipeline has pushed a value for it — null for the vast majority of
   * history (most clients/dates predate or aren't part of the NDMI trial),
   * not an error. Lives on the same `ndvi_trend` row as `ndvi` itself. */
  ndmi: number | null
}

/** One raster/pixel-classification capture for a plot, ascending order
 * (oldest first). Sourced from `ndvi_raster` — an independent pipeline
 * from `NdviHistoryEntry`'s trend dates, its own schedule (see
 * NDVI_Data_Model_Split_Migration_Plan.docx). `pngUrl` is frequently
 * null — most capture dates have real pixel-class stats but no surviving
 * local image; that's expected, not an error. */
export interface RasterHistoryEntry {
  date: Date
  ndvi: number | null
  pngUrl: string | null
  pixelDist: PixelDistribution
  /** NDMI mean/image for this same capture — same "may be null" caveats as
   * `NdviHistoryEntry.ndmi`, sourced from the same `ndvi_raster` row. */
  ndmi: number | null
  ndmiPngUrl: string | null
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
  /** Latest ndvi_raster row's image URL — null whenever no surviving local
   * PNG exists for that date, which is common; `pngDate` still tells you
   * WHEN the latest raster classification is from either way, so the UI
   * can show "as of {pngDate}" even with no picture to show. */
  pngUrl: string | null
  pngDate: Date | null
  /** Latest NDMI trend reading (plain last-observation, no spike-guard/
   * stage classification — none of that logic applies to NDMI yet, see
   * farmsignal_ndmi_pipeline_plan memory) and latest raster NDMI image,
   * sharing `pngDate` since both live on the same dated rows as their NDVI
   * counterparts. Null for the vast majority of fields (NDMI trial is
   * MEHTA-only so far). */
  ndmi: number | null
  ndmiPngUrl: string | null
  /** Full NDMI trend history, independent of `history` — deliberately NOT
   * gated on that same row having a non-null ndvi_mean (ndvi_trend_gee.py
   * and ndmi_trend_gee.py are two separate GEE jobs with their own 5-day
   * window binning, see fieldsRepository.ts's ndmiByPlot comment). Any
   * code that needs "every real NDMI reading for this field" (e.g. the AI
   * Insights moisture-stress check) should read this, not filter
   * `history` for a non-null `.ndmi`. */
  ndmiHistory: { date: Date; ndmi: number }[]
  /** Consecutive confirmed observations in 'attention', 0 if the field
   * isn't currently in attention/serious. Computed at load time (see
   * fieldsRepository.ts) rather than re-derived from raw history downstream. */
  attentionStreak: number
  history: NdviHistoryEntry[]
  /** Full raster/pixel-class capture history, independent of `history`'s
   * own trend dates — feeds the "browse previous NDVI maps" button. */
  rasterHistory: RasterHistoryEntry[]
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
  /** True when the `get_plot_boundaries` RPC failed — every plot shows as
   * "Not Mapped" until a retry, not because it genuinely has no survey. */
  boundariesFailed: boolean
  /** Resolved client/factory-level crop-stage thresholds (`thresholds.ts`),
   * built once at load time — the same lookup `fieldsRepository.ts` itself
   * uses for `FieldGeo.healthStatus`/`growthStage`, exposed here so UI
   * components that independently recompute stage thresholds for their own
   * display (e.g. the NDVI Trend chart's dashed threshold-range lines) stay
   * consistent with it instead of falling back to the hardcoded default. */
  stageResolver: (factoryCode: string, clientCode: string | null) => GrowthStage[]
}
