/** Ports PLOTTYPE_STYLE/PLOTTYPE_ORDER_NDVI/AGE_BUCKET_DAYS
 * (RS_Cane_Monitoring_S1.html:5501-5506) — Plant vs Ratoon crop-cycle
 * colors/order, shared by the NDVI Trend tab's grouped chart. */
export const PLOTTYPE_STYLE: Record<string, string> = {
  PL: '#15803D',
  R1: '#0D9488',
  R2: '#2563EB',
  R3: '#7C3AED',
  R4: '#DB2777',
  MR: '#EA580C',
  NU: '#6B7280',
}

export const PLOTTYPE_ORDER: string[] = ['PL', 'R1', 'R2', 'R3', 'R4', 'MR', 'NU']

export const AGE_BUCKET_DAYS = 15

export function plotTypeColor(plotType: string): string {
  return PLOTTYPE_STYLE[plotType] ?? '#6B7280'
}

export function orderPlotTypes(types: string[]): string[] {
  const present = new Set(types)
  return PLOTTYPE_ORDER.filter((t) => present.has(t)).concat(
    types.filter((t) => !PLOTTYPE_ORDER.includes(t)).sort(),
  )
}
