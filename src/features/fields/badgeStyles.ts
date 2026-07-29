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
