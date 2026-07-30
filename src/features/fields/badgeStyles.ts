import type { HealthStatus } from './growthStage'

/** Ports HEALTH_COLORS (RS_Cane_Monitoring_S1.html:5216), extended to the
 * 5-value HealthStatus this port already resolves 'attention' vs 'serious'
 * for at load time — no separate severityLabel() display step needed. */
export const HEALTH_LABEL: Record<HealthStatus, string> = {
  good: 'Good',
  optimal: 'Moderate',
  attention: 'Need Attention',
  serious: 'Need Serious Attention',
  unknown: 'Unknown',
}

/** Canonical health-status hex colors, user-specified (not derived from the
 * HTML source's own amber/red scheme) — single source of truth so the stat
 * row, Stage Summary, and Field Map all agree. Don't "correct" these back
 * toward RS_Cane_Monitoring_S1.html's HEALTH_COLORS; that's intentional. */
export const HEALTH_COLOR_HEX: Record<HealthStatus, string> = {
  good: '#22c55e',
  optimal: '#f97316',
  attention: '#ef4444',
  serious: '#7f1d1d',
  unknown: '#9ca3af',
}

export const HEALTH_BADGE_CLASS: Record<HealthStatus, string> = {
  good: 'bg-green-50 text-green-600 border border-green-200',
  optimal: 'bg-amber-50 text-amber-600 border border-amber-100',
  attention: 'bg-amber-100 text-amber-800 border border-amber-100',
  serious: 'bg-red-50 text-red-600 border border-red-100',
  unknown: 'bg-neutral-100 text-neutral-500 border border-neutral-200',
}

/** Ports STAGE_COLORS (RS_Cane_Monitoring_S1.html:5214-5215), expressed as
 * Tailwind classes consistent with the palette already ported in
 * index.css, keyed by the stage names in growthStage.ts's `stages`. */
export const STAGE_BADGE_CLASS: Record<string, string> = {
  Germination: 'bg-blue-50 text-blue-600 border border-blue-100',
  'Early Tiller': 'bg-purple-50 text-purple-600 border border-purple-100',
  Tillering: 'bg-teal-50 text-teal-600 border border-teal-100',
  'Grand Growth': 'bg-amber-50 text-amber-600 border border-amber-100',
  Maturity: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
}

export function stageBadgeClass(stageName: string): string {
  return STAGE_BADGE_CLASS[stageName] ?? 'bg-neutral-100 text-neutral-500 border border-neutral-200'
}

/** Hex equivalents of STAGE_BADGE_CLASS, for contexts that can't use
 * Tailwind classes (canvas-drawn chart bands via stageBandsPlugin). Uses
 * more saturated 200-level tones than STAGE_BADGE_CLASS's pale 50-level
 * badge backgrounds deliberately — at a thin 16px band height the near-
 * white 50-level tints were indistinguishable from each other (user
 * feedback: "all fill colors looks same"). */
export const STAGE_BAND_COLOR: Record<string, { fill: string; text: string }> = {
  Germination: { fill: '#bfdbfe', text: '#1e3a8a' },
  'Early Tiller': { fill: '#ddd6fe', text: '#4c1d95' },
  Tillering: { fill: '#99f6e4', text: '#134e4a' },
  'Grand Growth': { fill: '#fde68a', text: '#78350f' },
  Maturity: { fill: '#d1d5db', text: '#111827' },
}

export function stageBandColor(stageName: string): { fill: string; text: string } {
  return STAGE_BAND_COLOR[stageName] ?? { fill: '#f3f4f6', text: '#6b7280' }
}
