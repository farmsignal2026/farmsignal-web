// Ports the crop-growth-stage NDVI thresholds and classification logic,
// already verified in production on the Flutter mobile app
// (farmsignal_flutter/lib/features/fields/domain/growth_stage.dart), which
// itself ports RS_Cane_Monitoring_S1.html's STAGES/stageForAge/statusForNdvi/
// computeAttentionStreak. Kept as a 1:1 transcription so this dashboard and
// the mobile app can't silently drift apart on health classification.

export interface GrowthStage {
  name: string
  short: string
  days: number
  cumEnd: number
  tMin: number
  tMax: number
  expNdvi: number
}

export const stages: GrowthStage[] = [
  { name: 'Germination', short: 'Germ', days: 30, cumEnd: 30, tMin: 0.2, tMax: 0.4, expNdvi: 0.3 },
  { name: 'Early Tiller', short: 'E.Till', days: 45, cumEnd: 75, tMin: 0.35, tMax: 0.6, expNdvi: 0.5 },
  { name: 'Tillering', short: 'Tiller', days: 45, cumEnd: 120, tMin: 0.55, tMax: 0.7, expNdvi: 0.65 },
  { name: 'Grand Growth', short: 'Gr.Gr', days: 120, cumEnd: 240, tMin: 0.65, tMax: 0.8, expNdvi: 0.75 },
  { name: 'Maturity', short: 'Matur', days: 120, cumEnd: 360, tMin: 0.6, tMax: 0.7, expNdvi: 0.65 },
]

export const totalGrowthDays = 360
export const seriousStreakThreshold = 3

export interface StageForAgeResult {
  stage: GrowthStage
  index: number
  dayMin: number
  dayMax: number
}

/** Clamps out-of-range ages to Maturity (beyond 360d, common for ratoon
 * cycles) or Germination (negative age, bad plant-date data) rather than
 * returning null and silently dropping the plot from classification. */
export function stageForAge(age: number): StageForAgeResult | null {
  let dayMin = 0
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (age >= dayMin && age <= s.cumEnd) {
      return { stage: s, index: i, dayMin, dayMax: s.cumEnd }
    }
    dayMin = s.cumEnd
  }
  if (age > stages[stages.length - 1].cumEnd) {
    return {
      stage: stages[stages.length - 1],
      index: stages.length - 1,
      dayMin: stages[stages.length - 2].cumEnd,
      dayMax: stages[stages.length - 1].cumEnd,
    }
  }
  if (age < 0) {
    return { stage: stages[0], index: 0, dayMin: 0, dayMax: stages[0].cumEnd }
  }
  return null
}

export type HealthStatus = 'good' | 'optimal' | 'attention' | 'serious' | 'unknown'

export function statusForNdvi(ndvi: number, stage: GrowthStage): 'good' | 'optimal' | 'attention' {
  if (ndvi > stage.tMax) return 'good'
  if (ndvi >= stage.tMin) return 'optimal'
  return 'attention'
}

export interface NdviObservation {
  date: Date
  ndvi: number
  isLowConfidence: boolean
  isS1: boolean
}

/** How many consecutive CONFIRMED (non-low-confidence, non-S1) observations
 * a field has been in "attention", walking back from the latest reading.
 * 1-2 stays "Need Attention"; 3+ escalates to "Need Serious Attention". */
export function computeAttentionStreak(history: NdviObservation[], plantDate: Date): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h.isLowConfidence || h.isS1) continue
    const age = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
    const sf = stageForAge(age)
    if (sf === null) break
    const status = statusForNdvi(h.ndvi, sf.stage)
    if (status === 'attention') {
      streak++
    } else {
      break
    }
  }
  return streak
}

export interface SpikeGuardResult {
  observation: NdviObservation | null
}

/** Excludes low-confidence and S1-estimated rows from driving health status,
 * and treats a sudden >=0.15 NDVI drop as an unconfirmed spike unless the
 * next confirmed reading is within 0.15 of it (a sustained, real drop). */
export function spikeGuardLatest(history: NdviObservation[]): SpikeGuardResult {
  let lastConfNdvi: number | null = null
  let latestConf: NdviObservation | null = null

  for (let i = 0; i < history.length; i++) {
    const obs = history[i]
    if (obs.isLowConfidence || obs.isS1) continue

    if (lastConfNdvi !== null && obs.ndvi - lastConfNdvi <= -0.15) {
      const next = i + 1 < history.length ? history[i + 1] : null
      if (next && !next.isLowConfidence && !next.isS1 && Math.abs(next.ndvi - obs.ndvi) <= 0.15) {
        lastConfNdvi = obs.ndvi
        latestConf = obs
      }
      // else: unconfirmed spike — don't update baseline.
    } else {
      lastConfNdvi = obs.ndvi
      latestConf = obs
    }
  }

  return { observation: latestConf }
}
