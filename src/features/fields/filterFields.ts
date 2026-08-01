import type { SidebarFilters } from '../../components/dashboard/Sidebar'
import { DEFAULT_WATCH_THRESHOLD, isWatch, type StatCardKey } from './computeFieldStats'
import { seasonStartYearFor } from './season'
import type { Field, FieldGeo } from './types'

/** Combines the Sidebar's filters with the active stat-card category into a
 * single filtered list — the source every tab view reads from. Ports the
 * field-scoping portion of `applyFilters()` (RS_Cane_Monitoring_S1.html:
 * 2937+) relevant to a latest-only model. */
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
  if (filters.farmers.length > 0) result = result.filter((f) => filters.farmers.includes(f.name))
  if (filters.plot) result = result.filter((f) => f.code === filters.plot)
  if (filters.plots.length > 0) result = result.filter((f) => filters.plots.includes(f.code))
  if (filters.plotType) result = result.filter((f) => f.type === filters.plotType)
  if (filters.variety) result = result.filter((f) => f.variety === filters.variety)
  if (!filters.includeS1) result = result.filter((f) => !f.s1OnlyData)

  if (filters.cropStage === 'Post-Maturity') {
    // Not a real growth stage in growthStage.ts's `stages` — stageForAge()
    // deliberately clamps any age beyond 360d to 'Maturity' for NDVI
    // threshold purposes (see its own docstring), so `growthStage` alone
    // can't distinguish this. Filter-layer only, using the *un-clamped*
    // `growthDays`; doesn't touch the shared classification logic.
    result = result.filter((f) => (geoByCode[f.code]?.growthDays ?? 0) > 360)
  } else if (filters.cropStage === 'Maturity') {
    result = result.filter(
      (f) => geoByCode[f.code]?.growthStage === 'Maturity' && (geoByCode[f.code]?.growthDays ?? 0) <= 360,
    )
  } else if (filters.cropStage) {
    result = result.filter((f) => geoByCode[f.code]?.growthStage === filters.cropStage)
  }

  if (filters.cropStatus === 'Good') {
    result = result.filter((f) => f.healthStatus === 'good')
  } else if (filters.cropStatus === 'Moderate') {
    result = result.filter((f) => f.healthStatus === 'optimal')
  } else if (filters.cropStatus === 'Need attention') {
    // Ports the user's explicit clarification: the sidebar's "Need
    // attention" option is the combination of the stat row's separate
    // Need Attention + Need Serious Attention buckets, not just the milder
    // 'attention' value alone.
    result = result.filter((f) => f.healthStatus === 'attention' || f.healthStatus === 'serious')
  }

  if (filters.seasons.length > 0) {
    const selectedYears = new Set(filters.seasons.map(Number))
    result = result.filter((f) => {
      const sy = seasonStartYearFor(f.plantDateRaw)
      return sy !== null && selectedYears.has(sy)
    })
  }

  if (statFilter === 'watch') {
    result = result.filter((f) => isWatch(f, geoByCode[f.code], DEFAULT_WATCH_THRESHOLD))
  } else if (statFilter) {
    result = result.filter((f) => f.healthStatus === statFilter)
  }

  return result
}
