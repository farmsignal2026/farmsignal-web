import type { SidebarFilters } from '../../components/dashboard/Sidebar'
import { DEFAULT_WATCH_THRESHOLD, isWatch, type StatCardKey } from './computeFieldStats'
import type { Field, FieldGeo } from './types'

/** Combines the Sidebar's cascading Client/Factory/Division/Village/Plot
 * filters with the active stat-card category into a single filtered list —
 * the source all three Phase 2 views (Cards/Table/Summary) read from. Ports
 * the field-scoping portion of `applyFilters()`
 * (RS_Cane_Monitoring_S1.html:2937+) relevant to a latest-only model. */
export function filterFields(
  fields: Field[],
  filters: SidebarFilters,
  statFilter: StatCardKey | null,
  geoByCode: Record<string, FieldGeo>,
): Field[] {
  let result = fields

  if (filters.client) result = result.filter((f) => f.clientCode === filters.client)
  if (filters.factory) result = result.filter((f) => f.factory === filters.factory)
  if (filters.division) result = result.filter((f) => f.division === filters.division)
  if (filters.village) result = result.filter((f) => f.village === filters.village)
  if (filters.plot) result = result.filter((f) => f.code === filters.plot)

  if (statFilter === 'watch') {
    result = result.filter((f) => isWatch(f, geoByCode[f.code], DEFAULT_WATCH_THRESHOLD))
  } else if (statFilter) {
    result = result.filter((f) => f.healthStatus === statFilter)
  }

  return result
}
