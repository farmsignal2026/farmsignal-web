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
 * returning null and silently dropping the plot from classification.
 *
 * `stageTable` defaults to the hardcoded global `stages` — callers that
 * have resolved a per-client/factory table (`thresholds.ts`,
 * `resolveStagesForFactory`) pass it explicitly; everything that hasn't
 * been migrated to per-client thresholds yet keeps working unchanged by
 * omitting the argument. */
export function stageForAge(age: number, stageTable: GrowthStage[] = stages): StageForAgeResult | null {
  let dayMin = 0
  for (let i = 0; i < stageTable.length; i++) {
    const s = stageTable[i]
    if (age >= dayMin && age <= s.cumEnd) {
      return { stage: s, index: i, dayMin, dayMax: s.cumEnd }
    }
    dayMin = s.cumEnd
  }
  if (age > stageTable[stageTable.length - 1].cumEnd) {
    return {
      stage: stageTable[stageTable.length - 1],
      index: stageTable.length - 1,
      dayMin: stageTable[stageTable.length - 2].cumEnd,
      dayMax: stageTable[stageTable.length - 1].cumEnd,
    }
  }
  if (age < 0) {
    return { stage: stageTable[0], index: 0, dayMin: 0, dayMax: stageTable[0].cumEnd }
  }
  return null
}

export type HealthStatus = 'good' | 'optimal' | 'attention' | 'serious' | 'unknown'

export function statusForNdvi(ndvi: number, stage: GrowthStage): 'good' | 'optimal' | 'attention' {
  if (ndvi > stage.tMax) return 'good'
  if (ndvi >= stage.tMin) return 'optimal'
  return 'attention'
}

/** Ports source's per-plot Farmer Performance Score
 * (RS_Cane_Monitoring_S1.html:5168-5300): a single reading's NDVI as a
 * percentage of its stage's optimal midpoint, capped at 100 so a reading
 * far above the stage max can't blow the score past "perfect". Distinct
 * from Compare's Stage Matrix score (`compare.ts`), which averages many
 * observations *within* a stage and caps each stage's contribution at that
 * stage's own max-to-midpoint ratio (can exceed 100) rather than a flat
 * 100 — different purpose (aggregate stage comparison vs. one plot's
 * headline score), not a shared formula despite the visual similarity. */
export function scoreForNdvi(ndvi: number, stage: Pick<GrowthStage, 'tMin' | 'tMax'>): number {
  const mid = (stage.tMin + stage.tMax) / 2
  if (!mid) return 0
  return Math.min(100, Math.round((ndvi / mid) * 100))
}

export interface NdviObservation {
  date: Date
  ndvi: number
  isLowConfidence: boolean
  isS1: boolean
}

/** True if `history` has any CONFIRMED (non-low-confidence, non-S1)
 * reading dated strictly after `cutoff` that classifies as "attention" for
 * its own age. Used to detect a genuinely NEW decline after a scout cycle
 * closed — deliberately narrower than checking a plot's overall current
 * `healthStatus`, which reflects whatever the latest confirmed reading is
 * regardless of whether it predates the cutoff. Matches
 * farmsignal_flutter's `hasNewAttentionAfter` (growth_stage.dart) 1:1 —
 * confirmed as a real bug via live data on plot 8000785085, 2026-08-12:
 * its latest confirmed reading predated its follow-up by 6 weeks
 * (`crop_status='Same-Status'`, no decline at all); using overall current
 * health status there would have incorrectly reopened a genuinely fine
 * field as Unattended. */
export function hasNewAttentionAfter(
  history: NdviObservation[],
  cutoff: Date,
  plantDate: Date,
  stageTable: GrowthStage[] = stages,
): boolean {
  for (const h of history) {
    if (h.isLowConfidence || h.isS1) continue
    if (h.date <= cutoff) continue
    const age = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
    const sf = stageForAge(age, stageTable)
    if (!sf) continue
    if (statusForNdvi(h.ndvi, sf.stage) === 'attention') return true
  }
  return false
}

/** How many consecutive CONFIRMED (non-low-confidence, non-S1) observations
 * a field has been in "attention", walking back from the latest reading.
 * 1-2 stays "Need Attention"; 3+ escalates to "Need Serious Attention". */
export function computeAttentionStreak(
  history: NdviObservation[],
  plantDate: Date,
  stageTable: GrowthStage[] = stages,
): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h.isLowConfidence || h.isS1) continue
    const age = Math.round((h.date.getTime() - plantDate.getTime()) / 86400000)
    const sf = stageForAge(age, stageTable)
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

const SPIKE_DROP = 0.15

/** Ports "SPIKE GUARD WITH ESCALATION" (RS_Cane_Monitoring_S1.html:
 * 2764-2808) — Pass 1 flags any otherwise-confirmed reading that drops
 * >=0.15 NDVI from the last confirmed baseline as low-confidence (the
 * baseline doesn't advance past a flagged row, so a run of drops all
 * compare against the same pre-drop peak).
 *
 * Two escalation passes then decide which flagged drops are a real,
 * sustained decline rather than cloud/sensor noise on a single reading:
 *
 * Pass 2a (adjacent pair, close to EACH OTHER): if two ADJACENT flagged
 * readings land within 0.15 of each other — including an S1 estimate as a
 * valid confirming partner — that pairing itself is the confirmation;
 * restore both. Catches a drop that's immediately followed by a second
 * reading landing at roughly the same lower level.
 *
 * Pass 2b (2+ consecutive drops from the same baseline, added 2026-08-20):
 * catches the gap Pass 2a leaves — a genuinely worsening field whose
 * readings keep sliding to DIFFERENT low values (e.g. 0.62 then 0.19)
 * rather than landing twice at the same spot never satisfies 2a's
 * "close to each other" test, so it stayed "unconfirmed" and the field
 * kept showing its old, healthy status indefinitely. Real case: plot
 * 8000787637 (Erullappan) sat at "Good" off a month-old 0.84 reading while
 * its two latest readings (0.62, then 0.19 — neither harvest nor a data
 * gap, confirmed via plot_seasons.harvest_date being null) sat unconfirmed.
 * Any run of 2+ CONSECUTIVE non-S1 readings still flagged from Pass 1 —
 * regardless of how close they are to each other, only that each is
 * independently >=0.15 below the SAME pre-drop baseline — is treated as
 * confirmed. A single isolated flagged reading still stays unconfirmed,
 * preserving the original single-blip noise rejection. S1 estimates are
 * transparent to this pass (as in Pass 1) — they neither extend nor break
 * a run of real readings. Runs before Pass 2a so a 3+ run isn't partially
 * claimed by 2a's pairwise check first (2a pairing off two of three would
 * leave the third looking "isolated" to 2b).
 *
 * Both escalation passes treat the series' very last reading as eligible —
 * a genuine decline landing on the newest reading CAN still be confirmed.
 * A single-pass "does the next reading confirm this one" check (this
 * function's earlier form) cannot do that: the newest reading has no
 * "next" to confirm it, so any real decline that happens to be the latest
 * available data would stay "unconfirmed" forever and the field would
 * keep showing its old, better status — a real bug found via a live field
 * where this app showed "Good" (NDVI 0.74, a month-old peak) while the
 * source dashboard correctly showed "Need attention" (NDVI 0.41, the
 * actual latest reading). */
export function applySpikeGuardEscalation<T extends { ndvi: number; isLowConfidence: boolean; isS1: boolean }>(
  history: T[],
): T[] {
  const rows = history.map((h) => ({ ...h }))

  let lastConfirmedNdvi: number | null = null
  for (const r of rows) {
    if (r.isLowConfidence || r.isS1) continue
    if (lastConfirmedNdvi !== null && r.ndvi - lastConfirmedNdvi <= -SPIKE_DROP) {
      r.isLowConfidence = true
    } else {
      lastConfirmedNdvi = r.ndvi
    }
  }

  // Pass 2b — run before 2a, see docstring.
  const realIndices = rows.map((r, i) => (r.isS1 ? -1 : i)).filter((i) => i !== -1)
  let runStart = -1
  for (let k = 0; k <= realIndices.length; k++) {
    const idx = k < realIndices.length ? realIndices[k] : -1
    const inRun = idx !== -1 && rows[idx].isLowConfidence
    if (inRun) {
      if (runStart === -1) runStart = k
    } else {
      if (runStart !== -1 && k - runStart >= 2) {
        for (let m = runStart; m < k; m++) rows[realIndices[m]].isLowConfidence = false
      }
      runStart = -1
    }
  }

  // Pass 2a
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const curr = rows[i]
    if ((prev.isLowConfidence || prev.isS1) && (curr.isLowConfidence || curr.isS1) && Math.abs(curr.ndvi - prev.ndvi) <= SPIKE_DROP) {
      prev.isLowConfidence = false
      curr.isLowConfidence = false
    }
  }

  return rows
}

/** The latest reading not flagged low-confidence/S1 — call
 * `applySpikeGuardEscalation()` on the field's full history first so a
 * genuine sustained decline landing on the newest reading has already been
 * confirmed. Falls back to the raw latest reading if every reading is
 * still unconfirmed, matching source's own "prefer confirmed, fall back to
 * unconfirmed" comment (:7486-7488) rather than reporting no data at all. */
export function spikeGuardLatest(history: NdviObservation[]): SpikeGuardResult {
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].isLowConfidence && !history[i].isS1) return { observation: history[i] }
  }
  return { observation: history.length > 0 ? history[history.length - 1] : null }
}
