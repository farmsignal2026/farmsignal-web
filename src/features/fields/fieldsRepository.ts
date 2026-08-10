import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applySpikeGuardEscalation,
  computeAttentionStreak,
  seriousStreakThreshold,
  spikeGuardLatest,
  stageForAge,
  stages,
  statusForNdvi,
  type HealthStatus,
  type NdviObservation,
} from './growthStage'
import type {
  Field,
  FieldGeo,
  FieldsLoadResult,
  NdviHistoryEntry,
  PixelDistribution,
  RasterHistoryEntry,
  ScoutVisit,
  StagePoint,
} from './types'

interface ObsRow {
  date: Date
  ndvi: number
  isLowConfidence: boolean
  // ndvi_trend has no S1 rows at all (S1 estimates live in the separate
  // s1_observations table, not queried here) — always false, same as this
  // query's pre-split behavior (.eq('source','S2') already excluded every
  // S1 row). Kept as a field rather than removed since growthStage.ts's
  // spike-guard/streak functions and the trend chart's marker styling both
  // branch on it.
  isS1: boolean
  ndmi: number | null
}

interface RasterRow {
  date: Date
  ndvi: number | null
  pngUrl: string | null
  pctGood: number
  pctModerate: number
  pctAttention: number
  ndmi: number | null
  ndmiPngUrl: string | null
}

function toClassificationInput(o: ObsRow): NdviObservation {
  return { date: o.date, ndvi: o.ndvi, isLowConfidence: o.isLowConfidence, isS1: o.isS1 }
}

/** Parses a GeoJSON Polygon/MultiPolygon string (as returned by the
 * `get_plot_boundaries` RPC) into a flat outer-ring point list, flipping
 * GeoJSON's [lng,lat] order to [lat,lng]. */
function parseBoundaryGeojson(geojson: string): [number, number][] {
  const geom = JSON.parse(geojson) as { type: string; coordinates: unknown }
  let ring: number[][]
  if (geom.type === 'Polygon') {
    ring = (geom.coordinates as number[][][])[0]
  } else if (geom.type === 'MultiPolygon') {
    ring = (geom.coordinates as number[][][][])[0][0]
  } else {
    return []
  }
  return ring.map((c) => [c[1], c[0]] as [number, number])
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/** Ports `loadFieldDataFromSupabase()` (000_A_FarmSignal_APP_new.html:7118+),
 * as already verified on the Flutter mobile app
 * (farmsignal_flutter/lib/features/fields/data/fields_repository.dart) —
 * builds Field[] + FieldGeo[] from the same Supabase tables/RPCs the
 * production apps read, applying the same growth-stage/spike-guard/streak
 * classification. */
export class FieldsRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async loadFieldData(): Promise<FieldsLoadResult> {
    const [divRes, secRes, vilRes, facRes, farRes] = await Promise.all([
      this.client.from('divisions').select('code,name'),
      this.client.from('sections').select('code,name'),
      this.client.from('villages').select('code,name'),
      this.client.from('factories').select('code,name,group_code'),
      this.client.from('farmers').select('id,name,farmer_code,phone'),
    ])

    const divMap = Object.fromEntries((divRes.data ?? []).map((r) => [r.code as string, r.name as string]))
    const secMap = Object.fromEntries((secRes.data ?? []).map((r) => [r.code as string, r.name as string]))
    const vilMap = Object.fromEntries((vilRes.data ?? []).map((r) => [r.code as string, r.name as string]))
    const facMap = Object.fromEntries((facRes.data ?? []).map((r) => [r.code as string, r.name as string]))
    const facClientMap = Object.fromEntries(
      (facRes.data ?? []).map((r) => [r.code as string, (r.group_code as string | null) ?? null]),
    )
    const farMap = Object.fromEntries((farRes.data ?? []).map((r) => [r.id as string, r]))

    const { data: plotData, error: plotErr } = await this.client
      .from('v_plots_current')
      .select(
        'plot_no,division_code,section_code,village_code,factory_code,farmer_id,planting_date,variety_name,crop_type,plot_type,area_acres',
      )
      .eq('plot_is_active', true)
    if (plotErr) throw plotErr

    const allObs: Record<string, unknown>[] = []
    let from = 0
    while (true) {
      const { data: batch, error: obsErr } = await this.client
        .from('ndvi_trend')
        .select('plot_no,obs_date,ndvi_mean,ndmi_mean,obs_confidence')
        .order('obs_date', { ascending: true })
        .range(from, from + 999)
      if (obsErr) throw obsErr
      allObs.push(...(batch ?? []))
      if (!batch || batch.length < 1000) break
      from += 1000
    }

    // Raster/pixel-classification history — a separate pipeline from the
    // trend data above (its own schedule, its own dates), so this is a
    // wholly independent query, not a column selection off the same rows
    // the way it used to be before the ndvi_observations split (see
    // NDVI_Data_Model_Split_Migration_Plan.docx).
    const allRaster: Record<string, unknown>[] = []
    let rasterFrom = 0
    while (true) {
      const { data: batch, error: rasterErr } = await this.client
        .from('ndvi_raster')
        .select('plot_no,capture_date,ndvi_mean,pct_good,pct_moderate,pct_attention,raster_png_url,ndmi_mean,ndmi_png_url')
        .order('capture_date', { ascending: true })
        .range(rasterFrom, rasterFrom + 999)
      if (rasterErr) throw rasterErr
      allRaster.push(...(batch ?? []))
      if (!batch || batch.length < 1000) break
      rasterFrom += 1000
    }

    const boundaryByPlot: Record<string, { polygon: [number, number][]; centroid: [number, number]; gpsAcre: number | null }> = {}
    const { data: bndData, error: bndErr } = await this.client.rpc('get_plot_boundaries')
    let boundariesFailed = false
    if (bndErr) {
      // Deliberately don't throw — a boundary-fetch failure shouldn't take
      // down the whole field list, just leave every plot showing as "Not
      // Mapped" until retried. But that's a real, confusing-looking failure
      // mode if silent, so it's tracked and surfaced in the UI instead of
      // only reaching the console.
      console.error('get_plot_boundaries RPC failed:', bndErr)
      boundariesFailed = true
    }
    for (const row of (bndData ?? []) as Record<string, unknown>[]) {
      const geojsonStr = row.geojson as string | null
      if (!geojsonStr) continue
      try {
        const ring = parseBoundaryGeojson(geojsonStr)
        if (!ring.length) continue
        const lat = ring.reduce((s, c) => s + c[0], 0) / ring.length
        const lng = ring.reduce((s, c) => s + c[1], 0) / ring.length
        const gpsAcreRaw = row.gps_area_acres as number | null
        boundaryByPlot[row.plot_no as string] = { polygon: ring, centroid: [lat, lng], gpsAcre: gpsAcreRaw ?? null }
      } catch {
        // Malformed geometry for this plot — skip it.
      }
    }

    const ndviByPlot: Record<string, ObsRow[]> = {}
    // Independent of ndviByPlot on purpose — ndvi_trend_gee.py and
    // ndmi_trend_gee.py are two separate GEE jobs, each binning its own S2
    // image collection into its own 5-day windows, so a given row can have
    // a real ndmi_mean with ndvi_mean left null (that window's NDVI job
    // never committed a row for that exact date) or vice versa. Gating
    // NDMI history on "this row also has a non-null ndvi_mean" (the
    // original approach, reusing NdviHistoryEntry.ndmi via classifyHistory)
    // silently hid every such row — confirmed real, 2026-08-09: 2 of 5
    // plots found with genuine NDMI moisture stress were invisible to
    // Scout Recommendations for exactly this reason (8000796387,
    // 8000797866, both ndvi_mean=null on their stressed date).
    const ndmiByPlot: Record<string, { date: Date; ndmi: number }[]> = {}
    for (const o of allObs) {
      const pid = o.plot_no as string
      const ndmiMean = o.ndmi_mean
      if (ndmiMean != null) {
        ;(ndmiByPlot[pid] ??= []).push({ date: new Date(o.obs_date as string), ndmi: Number(ndmiMean) })
      }
      const ndviMean = o.ndvi_mean
      if (ndviMean == null) continue
      ;(ndviByPlot[pid] ??= []).push({
        date: new Date(o.obs_date as string),
        ndvi: Number(ndviMean),
        isLowConfidence: o.obs_confidence === 'low',
        isS1: false,
        ndmi: ndmiMean == null ? null : Number(ndmiMean),
      })
    }
    for (const key of Object.keys(ndviByPlot)) {
      ndviByPlot[key].sort((a, b) => a.date.getTime() - b.date.getTime())
    }
    for (const key of Object.keys(ndmiByPlot)) {
      ndmiByPlot[key].sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    const rasterByPlot: Record<string, RasterRow[]> = {}
    for (const r of allRaster) {
      const pid = r.plot_no as string
      const ndviMean = r.ndvi_mean
      const ndmiMean = r.ndmi_mean
      ;(rasterByPlot[pid] ??= []).push({
        date: new Date(r.capture_date as string),
        ndvi: ndviMean == null ? null : Number(ndviMean),
        pngUrl: (r.raster_png_url as string | null) ?? null,
        pctGood: Number(r.pct_good ?? 0),
        pctModerate: Number(r.pct_moderate ?? 0),
        pctAttention: Number(r.pct_attention ?? 0),
        ndmi: ndmiMean == null ? null : Number(ndmiMean),
        ndmiPngUrl: (r.ndmi_png_url as string | null) ?? null,
      })
    }
    for (const key of Object.keys(rasterByPlot)) {
      rasterByPlot[key].sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    // Scout visit history — needed for the needsScout grace period below.
    const { data: scoutRows } = await this.client
      .from('scout_reports')
      .select('plot_no,visit_date,follow_up_required,follow_up_date')
      .order('visit_date', { ascending: false })
    const scoutByPlot: Record<string, ScoutVisit[]> = {}
    for (const r of scoutRows ?? []) {
      const followUpDateStr = r.follow_up_date as string | null
      const pid = r.plot_no as string
      ;(scoutByPlot[pid] ??= []).push({
        visitDate: new Date(r.visit_date as string),
        followUpRequired: Boolean(r.follow_up_required),
        followUpDate: followUpDateStr ? new Date(followUpDateStr) : null,
      })
    }

    const fields: Field[] = []
    const geoData: FieldGeo[] = []
    const today = new Date()
    const followupAutoLiftDays = 20

    for (const p of plotData ?? []) {
      const pid = p.plot_no as string
      const farmerId = p.farmer_id as string | null
      const farmer = farmerId ? (farMap[farmerId] as Record<string, unknown> | undefined) : undefined
      const plantDateStr = p.planting_date as string | null
      const plantDate = plantDateStr ? new Date(plantDateStr) : null
      const boundary = boundaryByPlot[pid]
      // Escalation must run on the field's FULL history before anything
      // downstream (age-basis reading, prevNdvi, spikeGuardLatest, streak
      // counting, the per-observation classified chart) reads
      // `isLowConfidence` — see applySpikeGuardEscalation's docstring.
      const history = applySpikeGuardEscalation(ndviByPlot[pid] ?? [])

      const factoryCode = (p.factory_code as string | null) ?? ''
      const divisionCode = (p.division_code as string | null) ?? ''
      const areaAcres = p.area_acres

      let healthStatus: HealthStatus = 'unknown'
      let needsScout = false

      let ndvi: number | null = null
      let prevNdvi: number | null = null
      let growthStage = ''
      let growthDays: number | null = null
      let thresholdMin: number | null = null
      let thresholdMax: number | null = null
      let stageData: StagePoint[] = []
      let attentionStreak = 0

      const historyEntries: NdviHistoryEntry[] = history.map((h) => ({
        date: h.date,
        ndvi: h.ndvi,
        isLowConfidence: h.isLowConfidence,
        isS1: h.isS1,
        ndmi: h.ndmi,
      }))
      // Independent NDMI history (ndmiByPlot, not historyEntries) — see its
      // own definition above for why: a real ndmi_mean can sit on a row
      // whose ndvi_mean is null, which historyEntries would silently drop.
      const ndmiHistory = ndmiByPlot[pid] ?? []
      // Plain last-observation lookup — no spike-guard/stage classification
      // (none of that logic applies to NDMI yet, thresholds aren't decided).
      const latestNdmi: number | null = ndmiHistory.length > 0 ? ndmiHistory[ndmiHistory.length - 1].ndmi : null

      // Raster/pixel-class data is independent of the trend/plantDate guard
      // below — a plot can have real raster history even without a usable
      // trend reading, and vice versa (two separate pipelines, see
      // NDVI_Data_Model_Split_Migration_Plan.docx). "Latest" here means the
      // most recent capture_date PERIOD, whether or not that specific date
      // has a surviving image — never falls back to an older row just
      // because it happens to have a picture attached.
      const rasterRows = rasterByPlot[pid] ?? []
      const latestRaster = rasterRows.length > 0 ? rasterRows[rasterRows.length - 1] : null
      const pixelDist: PixelDistribution = latestRaster
        ? { good: latestRaster.pctGood, optimal: latestRaster.pctModerate, attention: latestRaster.pctAttention }
        : { good: 0, optimal: 0, attention: 0 }
      const pngUrl: string | null = latestRaster?.pngUrl ?? null
      const pngDate: Date | null = latestRaster?.date ?? null
      const ndmiPngUrl: string | null = latestRaster?.ndmiPngUrl ?? null
      const rasterHistory: RasterHistoryEntry[] = rasterRows.map((r) => ({
        date: r.date,
        ndvi: r.ndvi,
        pngUrl: r.pngUrl,
        pixelDist: { good: r.pctGood, optimal: r.pctModerate, attention: r.pctAttention },
        ndmi: r.ndmi,
        ndmiPngUrl: r.ndmiPngUrl,
      }))

      if (history.length > 0 && plantDate) {
        // Most recent non-low-confidence observation, or the absolute last
        // one if every observation is low-confidence. Growth-stage age must
        // be measured from THIS date, not from today.
        let latestForAge: ObsRow | undefined
        for (let i = history.length - 1; i >= 0; i--) {
          if (!history[i].isLowConfidence) {
            latestForAge = history[i]
            break
          }
        }
        latestForAge ??= history[history.length - 1]

        const age = Math.round((latestForAge.date.getTime() - plantDate.getTime()) / 86400000)
        const sf = stageForAge(age)
        if (sf) {
          const spike = spikeGuardLatest(history.map(toClassificationInput))
          growthStage = sf.stage.name
          growthDays = age
          thresholdMin = sf.stage.tMin
          thresholdMax = sf.stage.tMax

          // "latest"/"prev" for the NDVI trend arrow — most recent
          // non-low-confidence reading, prev = whatever came immediately
          // before it in the full history, regardless of confidence/S1.
          let latestNonLowIndex = history.length - 1
          for (let i = history.length - 1; i >= 0; i--) {
            if (!history[i].isLowConfidence) {
              latestNonLowIndex = i
              break
            }
          }
          const prevRow = latestNonLowIndex - 1 >= 0 ? history[latestNonLowIndex - 1] : null
          if (prevRow) prevNdvi = prevRow.ndvi

          if (!spike.observation) {
            healthStatus = 'unknown'
          } else {
            const latestConfNdvi = spike.observation.ndvi
            let status = statusForNdvi(latestConfNdvi, sf.stage)
            if (status === 'attention') {
              const streak = computeAttentionStreak(history.map(toClassificationInput), plantDate)
              attentionStreak = streak
              if (streak >= seriousStreakThreshold) {
                healthStatus = 'serious'
              } else {
                healthStatus = 'attention'
              }
            } else {
              healthStatus = status
            }

            ndvi = latestConfNdvi

            const plotScouts = scoutByPlot[pid] ?? []
            const lastVisit = plotScouts.length > 0 ? plotScouts[0] : null
            const daysSinceLastVisit = lastVisit
              ? Math.round((today.getTime() - lastVisit.visitDate.getTime()) / 86400000)
              : null
            const withinGracePeriod = Boolean(
              lastVisit &&
                lastVisit.followUpRequired &&
                daysSinceLastVisit !== null &&
                daysSinceLastVisit < followupAutoLiftDays,
            )
            needsScout = (healthStatus === 'attention' || healthStatus === 'serious') && !withinGracePeriod
          }

          stageData = stages.map((s, i) => {
            const dMin = i === 0 ? 0 : stages[i - 1].cumEnd
            const dMax = s.cumEnd
            if (dMin > age) return { ndvi: null, status: 'future' as const, current: false }
            let sum = 0
            let n = 0
            for (const h of history) {
              if (h.isLowConfidence || h.isS1) continue
              const a = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
              if (a >= dMin && a <= dMax) {
                sum += h.ndvi
                n++
              }
            }
            if (n === 0) return { ndvi: null, status: 'future' as const, current: false }
            const avg = sum / n
            return { ndvi: avg, status: statusForNdvi(avg, s), current: i === sf.index }
          })
        }
      }

      fields.push({
        code: pid,
        name: farmer ? ((farmer.name as string) ?? 'Unknown') : 'Unknown',
        factory: facMap[factoryCode] ?? factoryCode,
        factoryCode,
        clientCode: facClientMap[factoryCode] ?? null,
        division: divMap[divisionCode] ?? divisionCode,
        divisionCode,
        section: secMap[(p.section_code as string | null) ?? ''] ?? ((p.section_code as string | null) ?? ''),
        village: vilMap[(p.village_code as string | null) ?? ''] ?? ((p.village_code as string | null) ?? ''),
        area: areaAcres != null ? String(areaAcres) : '',
        variety: (p.variety_name as string | null) ?? '',
        type: (p.plot_type as string | null) ?? '',
        cropType: (p.crop_type as string | null) ?? '',
        date: plantDate ? formatDate(plantDate) : '',
        plantDateRaw: plantDate,
        phone: farmer ? ((farmer.phone as string | null) ?? '') : '',
        mapped: Boolean(boundary),
        healthStatus,
        farmerCode: farmer ? ((farmer.farmer_code as string | null) ?? '') : '',
        needsScout,
        s1OnlyData: history.length > 0 && history.every((h) => h.isS1),
      })

      geoData.push({
        code: pid,
        centroid: boundary?.centroid ?? null,
        polygon: boundary?.polygon ?? null,
        gpsAcre: boundary?.gpsAcre ?? null,
        ndvi,
        prevNdvi,
        healthStatus,
        growthStage,
        growthDays,
        thresholdMin,
        thresholdMax,
        pixelDist,
        stageData,
        pngUrl,
        pngDate,
        ndmi: latestNdmi,
        ndmiPngUrl,
        ndmiHistory,
        attentionStreak,
        history: historyEntries,
        rasterHistory,
      })
    }

    if (fields.length === 0) {
      throw new Error('No plots returned from Supabase.')
    }

    return { fields, geoData, scoutByPlot, boundariesFailed }
  }
}
