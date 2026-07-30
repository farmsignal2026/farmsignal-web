/** Ports `SCOUT_CATEGORIES` (000_A_FarmSignal_APP_new.html:5028-5067) /
 * farmsignal_flutter's scout_category.dart. */
export interface ScoutCategory {
  /** The category name — also the `stress_type` value and the checklist key. */
  key: string
  sub?: string[]
  /** Pest/Disease/Nutrient Deficit: sub-categories are multi-select, each
   * with its own severity. */
  multi?: boolean
  /** Same three categories: the sub-category picker comes first, and the
   * category's overall status is derived from the worst sub-severity. */
  subFirst?: boolean
  /** Expect Yield: the bucket picker is always shown, every visit. */
  alwaysSub?: boolean
  /** Expect Yield: no severity chips at all — it's a yield estimate. */
  noStatus?: boolean
  /** Others: free-text description instead of severity chips. */
  freeText?: boolean
  optional?: boolean
}

export const scoutCategories: ScoutCategory[] = [
  { key: 'Population Gap' },
  { key: 'Weed' },
  { key: 'Nutrient Deficit', sub: ['NPK', 'MN'], multi: true, alwaysSub: true, subFirst: true },
  { key: 'Irrigation Deficit' },
  { key: 'Waterlogging' },
  {
    key: 'Pest',
    sub: ['ESB', 'INB', 'White Grub', 'Mealy Bug', 'Whitefly', 'Other'],
    multi: true,
    alwaysSub: true,
    subFirst: true,
  },
  {
    key: 'Disease',
    sub: ['Sett Rot', 'Red Rot', 'Pokkah Boeng', 'Grassy Shoot', 'Yellow Leaf', 'Other'],
    multi: true,
    alwaysSub: true,
    subFirst: true,
  },
  { key: 'Soil Problem' },
  { key: 'Expect Yield', sub: ['Early to Estimate', '<30', '30-40', '40-50', '>50'], alwaysSub: true, noStatus: true },
  { key: 'Others', freeText: true, optional: true },
]

export interface SeverityColor {
  bg: string
  text: string
  border: string
}

/** Ports `SCOUT_STATUS_COLORS` (000_A_FarmSignal_APP_new.html:5041-5055). */
export const scoutSeverityColors: Record<string, SeverityColor> = {
  NIL: { bg: '#BDEAD0', text: '#0F4D2E', border: '#166534' },
  Low: { bg: '#D4F4DC', text: '#1A7A2E', border: '#2EA84A' },
  Moderate: { bg: '#FFF8DC', text: '#A07800', border: '#F0C030' },
  Severe: { bg: '#FDE8D0', text: '#994800', border: '#F07C2A' },
  'Very Severe': { bg: '#FDE8E8', text: '#A00000', border: '#EF4444' },
}

export function severityColor(status: string): SeverityColor {
  return scoutSeverityColors[status] ?? scoutSeverityColors.NIL
}
