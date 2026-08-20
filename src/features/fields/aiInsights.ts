import type { ScoutData } from '../scout/types'
import { classifyHistory, type ClassifiedObservation } from './classifyHistory'
import { nearestObs } from './healthTrend'
import { isFlagged, latestReport, SCOUT_REASON_CATEGORIES, type ChecklistEntry } from './scoutAnalytics'
import { scoreForNdvi, seriousStreakThreshold, stageForAge, stages, statusForNdvi, type GrowthStage } from './growthStage'
import type { Field, FieldGeo } from './types'

const DAY_MS = 86400000

type StageResolver = (factoryCode: string, clientCode: string | null) => GrowthStage[]
const defaultStageResolver: StageResolver = () => stages

/** The latest CONFIRMED (non-S1/low-confidence) row, falling back to the
 * raw latest if every row is still unconfirmed — same "prefer confirmed"
 * pattern as `spikeGuardLatest()`/`computeGoodStreak()`, applied to
 * `ClassifiedObservation` rows instead. */
function latestConfirmed(rows: ClassifiedObservation[]): ClassifiedObservation | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].isUnconfirmed) return rows[i]
  }
  return rows.length > 0 ? rows[rows.length - 1] : null
}

// ---------------------------------------------------------------------------
// 1. Change Detection — how many fields moved over the last ~15 days.
// ---------------------------------------------------------------------------

export interface ChangeDetectionEntry {
  field: Field
  delta: number
  latestNdvi: number
  priorNdvi: number
}

export interface ChangeDetectionResult {
  improved: ChangeDetectionEntry[]
  unchanged: ChangeDetectionEntry[]
  deteriorated: ChangeDetectionEntry[]
}

const CHANGE_WINDOW_DAYS = 15
const CHANGE_LOOKBACK_TOLERANCE_DAYS = 7
const IMPROVED_THRESHOLD = 0.03
const DETERIORATED_THRESHOLD = -0.03

/** Ports the user's own spec: "every 15 days, N fields improved / M
 * unchanged / K deteriorated". Each field's true latest confirmed reading
 * vs. the reading nearest 15 days before it (+/- a week tolerance, since
 * satellite passes don't land on exact days) — deliberately a smaller
 * threshold (+/-0.03) than the existing Watch alert (0.10), since this is
 * meant to catch everyday movement, not just a significant drop. */
export function computeChangeDetection(fields: Field[], geoByCode: Record<string, FieldGeo>): ChangeDetectionResult {
  const improved: ChangeDetectionEntry[] = []
  const unchanged: ChangeDetectionEntry[] = []
  const deteriorated: ChangeDetectionEntry[] = []

  for (const field of fields) {
    const geo = geoByCode[field.code]
    const rows = classifyHistory(field, geo)
    const latest = latestConfirmed(rows)
    if (!latest) continue

    const target = new Date(latest.date.getTime() - CHANGE_WINDOW_DAYS * DAY_MS)
    const priorCandidates = rows.filter((r) => r.date.getTime() < latest.date.getTime())
    const prior = nearestObs(priorCandidates, target, CHANGE_LOOKBACK_TOLERANCE_DAYS)
    if (!prior) continue

    const delta = Number((latest.ndvi - prior.ndvi).toFixed(3))
    const entry: ChangeDetectionEntry = { field, delta, latestNdvi: latest.ndvi, priorNdvi: prior.ndvi }

    if (delta >= IMPROVED_THRESHOLD) improved.push(entry)
    else if (delta <= DETERIORATED_THRESHOLD) deteriorated.push(entry)
    else unchanged.push(entry)
  }

  const byDeltaDesc = (a: ChangeDetectionEntry, b: ChangeDetectionEntry) => b.delta - a.delta
  const byDeltaAsc = (a: ChangeDetectionEntry, b: ChangeDetectionEntry) => a.delta - b.delta

  return {
    improved: improved.sort(byDeltaDesc),
    unchanged: unchanged.sort(byDeltaDesc),
    deteriorated: deteriorated.sort(byDeltaAsc),
  }
}

// ---------------------------------------------------------------------------
// 2a. Weed suspicion — NDVI abnormally high for a canopy that isn't closed.
// ---------------------------------------------------------------------------

export interface WeedSuspicionEntry {
  field: Field
  ndvi: number
  stageName: string
  excess: number
  /** The field's latest scout visit's Weed checklist rating (NIL/Low/
   * Moderate/Severe/Very Severe), or null if never scouted for weed. */
  scoutWeedStatus: string | null
}

const WEED_EXCESS_THRESHOLD = 0.06
/** Germination + Early Tiller + Tillering (stages[0..2], cumEnd 120) —
 * canopy isn't fully closed through any of these, so an abnormal spike
 * reads more like weeds filling gaps than genuine cane vigor. Grand Growth
 * onward is excluded: a real, healthy dense canopy legitimately exceeds
 * stage max by a lot there. */
const WEED_MAX_AGE = 120

/** The field's latest scout visit's Weed checklist rating, or null if
 * never scouted for weed. Every NDVI-flagged field is listed regardless of
 * this value — it used to suppress NIL/Low fields entirely, but per user
 * request that suppression is revoked: show every flagged field with the
 * scout's actual finding as a remark, rather than hiding some silently. */
export function scoutWeedStatus(scoutData: ScoutData, plotCode: string): string | null {
  const report = latestReport(scoutData, plotCode)
  const entry = report?.checklist['Weed'] as ChecklistEntry | undefined
  return entry?.status ?? null
}

export function computeWeedSuspicion(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  stageResolver: StageResolver = defaultStageResolver,
): WeedSuspicionEntry[] {
  const out: WeedSuspicionEntry[] = []
  for (const field of fields) {
    const geo = geoByCode[field.code]
    const fieldStages = stageResolver(field.factoryCode, field.clientCode)
    const rows = classifyHistory(field, geo, fieldStages)
    const latest = latestConfirmed(rows)
    if (!latest || latest.age < 0 || latest.age > WEED_MAX_AGE) continue
    const sf = stageForAge(latest.age, fieldStages)
    if (!sf) continue
    const excess = Number((latest.ndvi - sf.stage.tMax).toFixed(3))
    if (excess >= WEED_EXCESS_THRESHOLD) {
      out.push({
        field,
        ndvi: latest.ndvi,
        stageName: sf.stage.name,
        excess,
        scoutWeedStatus: scoutWeedStatus(scoutData, field.code),
      })
    }
  }
  return out.sort((a, b) => b.excess - a.excess)
}

// ---------------------------------------------------------------------------
// 2b. Planting date suspicion — recorded date too early, true planting later.
// Both signatures below point the SAME direction (recorded age overstates
// true age); they're just caught at two different points in the (wrongly
// dated) crop cycle. See the plan doc for the full agronomic reasoning.
// ---------------------------------------------------------------------------

export type PlantingDateSignature = 'early-residue' | 'late-immature'

export interface PlantingDateSuspicionEntry {
  field: Field
  signature: PlantingDateSignature
  note: string
}

const RESIDUE_AGE_MAX = 30
const RESIDUE_LOW_MAX = 0.28

const IMMATURE_AGE_MIN = 120
const IMMATURE_AGE_MAX = 150

export function computePlantingDateSuspicion(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  stageResolver: StageResolver = defaultStageResolver,
): PlantingDateSuspicionEntry[] {
  const out: PlantingDateSuspicionEntry[] = []

  for (const field of fields) {
    const geo = geoByCode[field.code]
    const fieldStages = stageResolver(field.factoryCode, field.clientCode)
    const rows = classifyHistory(field, geo, fieldStages)
    if (rows.length === 0) continue

    // Signature 1 — simple rule per user, two independent conditions
    // within the recorded Germination window (age 0-30):
    //   (a) beginning NDVI already above Germination's own ceiling (0.4) —
    //       looks like a previous, more mature crop was still standing.
    //   (b) NDVI never exceeds 0.3 anywhere in the window — no real
    //       germination growth signal at all, consistent with the field
    //       not actually being planted yet at the recorded date.
    // Either way the story is the same: true planting is likely later than
    // recorded. Deliberately simple for now — to be fine-tuned once more
    // real fields have been checked against it.
    const window = rows.filter((r) => !r.isUnconfirmed && r.age >= 0 && r.age <= RESIDUE_AGE_MAX)
    if (window.length > 0) {
      const beginning = window[0].ndvi
      const maxNdvi = Math.max(...window.map((r) => r.ndvi))
      if (beginning > fieldStages[0].tMax) {
        out.push({
          field,
          signature: 'early-residue',
          note: `NDVI starts at ${beginning.toFixed(2)}, already above Germination's expected ceiling (${fieldStages[0].tMax}) — looks like the previous crop was still standing when this plant date was recorded. True planting is likely later than recorded.`,
        })
        continue
      }
      if (maxNdvi <= RESIDUE_LOW_MAX) {
        out.push({
          field,
          signature: 'early-residue',
          note: `NDVI never exceeds ${maxNdvi.toFixed(2)} through day ${RESIDUE_AGE_MAX} — no real germination growth signal yet, consistent with the field not actually being planted at the recorded date. True planting is likely later than recorded.`,
        })
        continue
      }
    }

    // Signature 2: recorded age 120-150 days (early Grand Growth) judged
    // "attention" against Grand Growth's higher thresholds, but reads
    // good/optimal against the PREVIOUS stage's (Tillering's) thresholds —
    // the "attention" label is likely a wrong-stage artifact, not a real
    // health issue, and recorded age is likely overstated.
    if (field.healthStatus === 'attention') {
      const latest = latestConfirmed(rows)
      if (latest && latest.age >= IMMATURE_AGE_MIN && latest.age <= IMMATURE_AGE_MAX) {
        const sf = stageForAge(latest.age, fieldStages)
        if (sf && sf.index > 0) {
          const prevStage = fieldStages[sf.index - 1]
          const prevStatus = statusForNdvi(latest.ndvi, prevStage)
          if (prevStatus === 'good' || prevStatus === 'optimal') {
            out.push({
              field,
              signature: 'late-immature',
              note: `NDVI ${latest.ndvi.toFixed(2)} reads ${prevStatus} for ${prevStage.name} but "Need Attention" for the recorded ${sf.stage.name} stage — recorded age (${latest.age}d) is likely overstated.`,
            })
          }
        }
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// 3. Scout Recommendation — a specific reason, not just the bare NDVI label.
// ---------------------------------------------------------------------------

const FLAG_RANK: Record<string, number> = { Moderate: 1, Severe: 2, 'Very Severe': 3 }

const MOISTURE_STRESS_GATE_DAYS = 120 // Tillering ends / Grand Growth starts (stages[2].cumEnd) — no
                                       // moisture-stress read is attempted before this, per user decision
                                       // (2026-08-09): the signal isn't meaningful on a young, not-yet-closed
                                       // canopy.
const V_SEVERE_NDMI_MAX = 0.0
const SEVERE_NDMI_MAX = 0.15
// Same value as seriousStreakThreshold (growthStage.ts) — same "3
// consecutive bad readings escalates the label" idea already used for
// NDVI attention→serious, reused here rather than inventing a second
// threshold for the same shape of rule.
const DROUGHT_PRONE_STREAK = seriousStreakThreshold

export type MoistureStressLevel = 'v-severe' | 'severe' | 'drought-prone'

export interface MoistureStressResult {
  level: MoistureStressLevel
  label: string
  ndmi: number
  streak: number
}

const MOISTURE_STRESS_LABEL: Record<MoistureStressLevel, string> = {
  'v-severe': 'V. Severe moisture stress',
  severe: 'Severe moisture stress',
  'drought-prone': 'Drought prone',
}

/** Latest-reading moisture-stress read for one field, gated to
 * Grand-Growth-onward (day > 120) per user decision (2026-08-09) — NDMI's
 * relationship to real canopy moisture isn't considered meaningful before
 * the canopy has closed. Escalates a persistent (3+ consecutive, at-or-
 * after-gate) Severe/V.Severe run to "Drought prone" — the same
 * single-observation-is-noise/multi-observation-is-signal reasoning as
 * `computeAttentionStreak`, just applied to NDMI instead of NDVI, since a
 * field reads as more genuinely at-risk on a sustained pattern than on
 * one low reading. Returns null if there's no NDMI history past the gate,
 * or the latest gated reading isn't stressed at all. */
export function moistureStressForField(field: Field, geo: FieldGeo | undefined): MoistureStressResult | null {
  if (!geo || !field.plantDateRaw) return null
  // geo.ndmiHistory, NOT classifyHistory(field, geo) — the latter is built
  // from NDVI-gated rows (fieldsRepository.ts's ndviByPlot loop drops any
  // row with a null ndvi_mean), which silently hid real NDMI readings that
  // happened to land on a date ndvi_trend_gee.py never committed an NDVI
  // value for — confirmed real, 2026-08-09 (plots 8000796387, 8000797866).
  const plantDate = field.plantDateRaw
  const rows = geo.ndmiHistory
    .map((h) => ({ ndmi: h.ndmi, age: Math.round((h.date.getTime() - plantDate.getTime()) / 86400000) }))
    .filter((r) => r.age > MOISTURE_STRESS_GATE_DAYS)
  if (rows.length === 0) return null

  const latest = rows[rows.length - 1]
  const latestNdmi = latest.ndmi
  let level: MoistureStressLevel | null = null
  if (latestNdmi <= V_SEVERE_NDMI_MAX) level = 'v-severe'
  else if (latestNdmi <= SEVERE_NDMI_MAX) level = 'severe'
  if (level === null) return null

  let streak = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const ndmi = rows[i].ndmi
    if (ndmi <= SEVERE_NDMI_MAX) streak++
    else break
  }

  return {
    level: streak >= DROUGHT_PRONE_STREAK ? 'drought-prone' : level,
    label: MOISTURE_STRESS_LABEL[streak >= DROUGHT_PRONE_STREAK ? 'drought-prone' : level],
    ndmi: latestNdmi,
    streak,
  }
}

export interface ScoutRecommendationEntry {
  field: Field
  /** null for a field surfaced ONLY by NDMI moisture stress — it never
   * crossed the NDVI attention/serious threshold, so there's no NDVI
   * severity to show; see `moistureStress` instead. */
  severity: 'serious' | 'attention' | null
  reason: string
  category: string | null
  flagStatus: string | null
  moistureStress: MoistureStressResult | null
}

/** For every Need-Attention/Need-Serious-Attention field, surfaces the
 * single most severe flagged checklist category from its latest scout
 * visit (reusing `isFlagged`/`SCOUT_REASON_CATEGORIES` from
 * scoutAnalytics.ts — same flag definition as Scout Reasons, not a second
 * copy) instead of just repeating the NDVI-threshold label the user
 * already sees on the field's own card. ALSO surfaces fields whose NDVI
 * looks fine (Good/Moderate) but whose NDMI shows real post-Grand-Growth
 * moisture stress — per user decision (2026-08-09): "some moderate
 * ndvi_class plots also NDMI class stress" is exactly the case NDVI-only
 * scouting would silently miss. */
export function computeScoutRecommendation(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
): ScoutRecommendationEntry[] {
  const out: ScoutRecommendationEntry[] = []

  for (const field of fields) {
    const ndviTriggered = field.healthStatus === 'attention' || field.healthStatus === 'serious'
    const moistureStress = moistureStressForField(field, geoByCode[field.code])
    if (!ndviTriggered && !moistureStress) continue
    const report = latestReport(scoutData, field.code)

    let reason: string
    let category: string | null = null
    let flagStatus: string | null = null

    if (!report) {
      reason = 'Needs scouting — no visit on record'
    } else {
      let best: { cat: string; status: string; rank: number } | null = null
      for (const cat of SCOUT_REASON_CATEGORIES) {
        const entry = report.checklist[cat] as ChecklistEntry | undefined
        if (!isFlagged(entry)) continue
        const rank = FLAG_RANK[entry!.status!] ?? 0
        if (!best || rank > best.rank) best = { cat, status: entry!.status!, rank }
      }
      if (best) {
        reason = `${best.cat} — ${best.status}`
        category = best.cat
        flagStatus = best.status
      } else {
        reason = 'Scouted — no specific issue flagged'
      }
    }

    out.push({
      field,
      severity: ndviTriggered ? (field.healthStatus === 'serious' ? 'serious' : 'attention') : null,
      reason,
      category,
      flagStatus,
      moistureStress,
    })
  }

  return out.sort((a, b) => severityRank(b) - severityRank(a) || (FLAG_RANK[b.flagStatus ?? ''] ?? 0) - (FLAG_RANK[a.flagStatus ?? ''] ?? 0))
}

const MOISTURE_LEVEL_RANK: Record<MoistureStressLevel, number> = { 'drought-prone': 2, 'v-severe': 1, severe: 0 }

/** Combined ordering across both triggers — NDVI serious/attention always
 * outranks an NDMI-only entry (NDVI crossing its own threshold is still
 * the stronger, better-understood signal), then NDMI-only entries rank by
 * how severe/persistent their moisture stress is. */
function severityRank(entry: ScoutRecommendationEntry): number {
  if (entry.severity === 'serious') return 10
  if (entry.severity === 'attention') return 9
  if (entry.moistureStress) return MOISTURE_LEVEL_RANK[entry.moistureStress.level]
  return -1
}

// ---------------------------------------------------------------------------
// 4. Farmer Performance Rank + Top/Bottom 10 Plots.
// ---------------------------------------------------------------------------

export interface PlotScore {
  field: Field
  score: number
  stageName: string
}

/** One score per currently-monitored plot, via `scoreForNdvi()`
 * (growthStage.ts) — the per-plot headline score, distinct from Compare's
 * per-stage-cell aggregate score. Reads `geo.thresholdMin`/`thresholdMax`
 * directly rather than re-resolving stages from scratch — those are
 * already the correct client/factory-resolved values `fieldsRepository.ts`
 * wrote for this exact field (a real bug until fixed 2026-08-19: this used
 * to look the stage up in the global default `stages` array by name,
 * silently using the wrong NDVI midpoint for any client/factory with
 * overridden thresholds, even though `geo.growthStage`/`geo.ndvi`
 * themselves were already correct). */
export function computePlotScores(fields: Field[], geoByCode: Record<string, FieldGeo>): PlotScore[] {
  const out: PlotScore[] = []
  for (const field of fields) {
    const geo = geoByCode[field.code]
    if (!geo || geo.ndvi == null || !geo.growthStage || geo.thresholdMin == null || geo.thresholdMax == null) continue
    out.push({
      field,
      score: scoreForNdvi(geo.ndvi, { tMin: geo.thresholdMin, tMax: geo.thresholdMax }),
      stageName: geo.growthStage,
    })
  }
  return out
}

export interface FarmerPerformanceEntry {
  farmer: string
  avgScore: number
  scoutCoveragePct: number
  avgTrend: number
  plots: PlotScore[]
}

/** Ranks farmers by: crop-stage-normalized average score (`scoreForNdvi`),
 * scout coverage (% of their plots with at least one scout report), and
 * trend (average of their plots' Change Detection deltas) — the three
 * dimensions the user asked for. Reuses `computeChangeDetection`'s output
 * rather than re-deriving deltas a second time. */
export function computeFarmerPerformance(
  fields: Field[],
  geoByCode: Record<string, FieldGeo>,
  scoutData: ScoutData,
  changeDetection: ChangeDetectionResult,
): FarmerPerformanceEntry[] {
  const plotScores = computePlotScores(fields, geoByCode)

  const deltaByCode = new Map<string, number>()
  for (const e of [...changeDetection.improved, ...changeDetection.unchanged, ...changeDetection.deteriorated]) {
    deltaByCode.set(e.field.code, e.delta)
  }

  const byFarmer = new Map<string, PlotScore[]>()
  for (const ps of plotScores) {
    const name = ps.field.name || 'Unknown'
    if (!byFarmer.has(name)) byFarmer.set(name, [])
    byFarmer.get(name)!.push(ps)
  }

  const entries: FarmerPerformanceEntry[] = []
  for (const [farmer, plots] of byFarmer) {
    const avgScore = plots.reduce((s, p) => s + p.score, 0) / plots.length
    const scoutedCount = plots.filter((p) => (scoutData.reportsByPlot[p.field.code]?.length ?? 0) > 0).length
    const scoutCoveragePct = (scoutedCount / plots.length) * 100
    const deltas = plots.map((p) => deltaByCode.get(p.field.code)).filter((d): d is number => d != null)
    const avgTrend = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0

    entries.push({
      farmer,
      avgScore,
      scoutCoveragePct,
      avgTrend,
      plots: [...plots].sort((a, b) => b.score - a.score),
    })
  }

  return entries.sort((a, b) => b.avgScore - a.avgScore)
}

/** Flat plot-level ranking (not farmer-grouped) — the new Top/Bottom 10
 * Plots section, additive to Health Summary rather than replacing it. */
export function topBottomPlots(plotScores: PlotScore[], n = 10): { top: PlotScore[]; bottom: PlotScore[] } {
  const sorted = [...plotScores].sort((a, b) => b.score - a.score)
  return { top: sorted.slice(0, n), bottom: sorted.slice(-n).reverse() }
}
