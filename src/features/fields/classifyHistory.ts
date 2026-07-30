import { stageForAge, statusForNdvi, type HealthStatus } from './growthStage'
import type { Field, FieldGeo } from './types'

export interface ClassifiedObservation {
  date: Date
  age: number
  ndvi: number
  /** 3-value only (good/optimal/attention/unknown) — 'serious' is a
   * latest-only streak overlay (see fieldsRepository.ts), never a
   * per-observation value, same finding already applied in
   * StageSummaryView's Persistent Issues list. */
  status: HealthStatus
  isS1: boolean
  isLowConfidence: boolean
  /** True for S1/low-confidence readings — a pending/estimated point, not
   * yet a confirmed classification (HTML's "Unconfirmed" badge). */
  isUnconfirmed: boolean
}

/** Turns one field's full NDVI history into classified per-observation rows
 * — the historical layer Phase 2 deliberately deferred (latest-only), now
 * needed by the Field Cards sparkline, the single-plot trend popup, and the
 * NDVI Trend tab's Plant-vs-Ratoon grouping. Ports the per-row classification
 * inline in `loadFieldDataFromSupabase()`/`renderChart()`
 * (RS_Cane_Monitoring_S1.html) applied across a field's whole history
 * instead of just its latest reading. */
export function classifyHistory(field: Field, geo: FieldGeo | undefined): ClassifiedObservation[] {
  const plantDate = field.plantDateRaw
  if (!geo || !plantDate) return []

  return geo.history.map((h) => {
    const age = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
    const sf = stageForAge(age)
    const status: HealthStatus = sf ? statusForNdvi(h.ndvi, sf.stage) : 'unknown'
    return {
      date: h.date,
      age,
      ndvi: h.ndvi,
      status,
      isS1: h.isS1,
      isLowConfidence: h.isLowConfidence,
      isUnconfirmed: h.isS1 || h.isLowConfidence,
    }
  })
}
