import { useMemo } from 'react'
import { stages } from '../../features/fields/growthStage'
import { orderPlotTypes } from '../../features/fields/plotTypeStyle'
import { getCurrentSeasonStartYear, seasonLabelForYear, seasonStartYearFor } from '../../features/fields/season'
import type { Field } from '../../features/fields/types'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { SearchableSelect } from './SearchableSelect'

export interface SidebarFilters {
  client: string
  factory: string
  division: string
  village: string
  plot: string
  /** Multiple plot codes selected elsewhere (e.g. Health Summary's
   * multi-select lists) — a separate dimension from the single-value
   * `plot` search filter above, same relationship as `farmers`/no
   * single-farmer equivalent. */
  plots: string[]
  plotType: string
  variety: string
  cropStage: string
  cropStatus: string
  seasons: string[]
  farmers: string[]
}

export const EMPTY_FILTERS: SidebarFilters = {
  client: '',
  factory: '',
  division: '',
  village: '',
  plot: '',
  plots: [],
  plotType: '',
  variety: '',
  cropStage: '',
  cropStatus: '',
  seasons: [],
  farmers: [],
}

interface SidebarProps {
  fields: Field[]
  filters: SidebarFilters
  onChange: (next: SidebarFilters) => void
  onOverviewClick: () => void
  overviewActive: boolean
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b))
}

/** Cascading Client/Factory/Division/Village/Farmer/Plot filters (plain
 * <select>s for the single-value ones — RS_Cane_Monitoring_S1.html:638-687's
 * custom multi-select checkbox widget was deferred in Phase 1 since nothing
 * used it yet; Plant Season and Farmer now get a real multi-select via
 * MultiSelectDropdown since they need it), plus non-cascading Plot
 * Type/Crop Stage/Crop Status. */
export function Sidebar({ fields, filters, onChange, onOverviewClick, overviewActive }: SidebarProps) {
  const clients = useMemo(() => uniqueSorted(fields.map((f) => f.clientCode)), [fields])

  const factoryScoped = useMemo(
    () => fields.filter((f) => !filters.client || f.clientCode === filters.client),
    [fields, filters.client],
  )
  const factories = useMemo(() => uniqueSorted(factoryScoped.map((f) => f.factory)), [factoryScoped])

  const divisionScoped = useMemo(
    () => factoryScoped.filter((f) => !filters.factory || f.factory === filters.factory),
    [factoryScoped, filters.factory],
  )
  const divisions = useMemo(() => uniqueSorted(divisionScoped.map((f) => f.division)), [divisionScoped])

  const villageScoped = useMemo(
    () => divisionScoped.filter((f) => !filters.division || f.division === filters.division),
    [divisionScoped, filters.division],
  )
  const villages = useMemo(() => uniqueSorted(villageScoped.map((f) => f.village)), [villageScoped])

  const farmerScoped = useMemo(
    () => villageScoped.filter((f) => !filters.village || f.village === filters.village),
    [villageScoped, filters.village],
  )
  const farmers = useMemo(() => uniqueSorted(farmerScoped.map((f) => f.name)), [farmerScoped])

  const plotScoped = useMemo(
    () => farmerScoped.filter((f) => filters.farmers.length === 0 || filters.farmers.includes(f.name)),
    [farmerScoped, filters.farmers],
  )
  const plots = useMemo(() => uniqueSorted(plotScoped.map((f) => f.code)), [plotScoped])

  const plotTypes = useMemo(() => orderPlotTypes(uniqueSorted(fields.map((f) => f.type))), [fields])
  const varieties = useMemo(() => uniqueSorted(fields.map((f) => f.variety)), [fields])

  const seasonOptions = useMemo(() => {
    const years = new Set<number>()
    fields.forEach((f) => {
      const sy = seasonStartYearFor(f.plantDateRaw)
      if (sy !== null) years.add(sy)
    })
    years.add(getCurrentSeasonStartYear())
    const currentYear = getCurrentSeasonStartYear()
    return Array.from(years)
      .sort((a, b) => a - b)
      .map((y) => ({
        value: String(y),
        label: seasonLabelForYear(y) + (y === currentYear ? ' (current)' : ''),
      }))
  }, [fields])

  const set = (patch: Partial<SidebarFilters>) => onChange({ ...filters, ...patch })

  return (
    <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={onOverviewClick}
        className={`w-full rounded-lg px-3 py-2.5 text-sm font-bold text-white shadow-sm transition ${
          overviewActive
            ? 'bg-gradient-to-br from-green-600 to-green-500 ring-2 ring-green-300 ring-offset-1'
            : 'bg-gradient-to-br from-blue-800 to-blue-600'
        }`}
      >
        📊 Executive Summary
      </button>

      <div>
        <div className="mb-2 text-xs font-semibold text-neutral-500">🔎 Filters</div>
        <div className="space-y-3">
          <FilterSelect
            label="Client"
            value={filters.client}
            options={clients}
            onChange={(v) => set({ client: v, factory: '', division: '', village: '', farmers: [], plot: '' })}
          />
          <FilterSelect
            label="Factory / Mill"
            value={filters.factory}
            options={factories}
            onChange={(v) => set({ factory: v, division: '', village: '', farmers: [], plot: '' })}
          />
          <MultiSelectDropdown
            label="Plant Season"
            options={seasonOptions}
            selected={filters.seasons}
            onChange={(v) => set({ seasons: v })}
            placeholder="All seasons"
          />
          <FilterSelect
            label="Division"
            value={filters.division}
            options={divisions}
            onChange={(v) => set({ division: v, village: '', farmers: [], plot: '' })}
          />
          <FilterSelect
            label="Village"
            value={filters.village}
            options={villages}
            onChange={(v) => set({ village: v, farmers: [], plot: '' })}
          />
          <MultiSelectDropdown
            label="Farmer"
            options={farmers.map((f) => ({ value: f, label: f }))}
            selected={filters.farmers}
            onChange={(v) => set({ farmers: v, plot: '' })}
            searchable
            placeholder="All farmers"
          />
          <SearchableSelect label="Plot" value={filters.plot} options={plots} onChange={(v) => set({ plot: v })} />
          <FilterSelect
            label="Plot Type"
            value={filters.plotType}
            options={plotTypes}
            onChange={(v) => set({ plotType: v })}
          />
          <FilterSelect
            label="Variety"
            value={filters.variety}
            options={varieties}
            onChange={(v) => set({ variety: v })}
          />
          <FilterSelect
            label="Crop Stage"
            value={filters.cropStage}
            options={[...stages.map((s) => s.name), 'Post-Maturity']}
            onChange={(v) => set({ cropStage: v })}
          />
          <FilterSelect
            label="Crop Status"
            value={filters.cropStatus}
            options={['Good', 'Moderate', 'Need attention']}
            onChange={(v) => set({ cropStatus: v })}
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="mt-3 w-full rounded-md border border-neutral-200 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
        >
          ↺ Reset filters
        </button>
      </div>
    </aside>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const active = value !== ''
  return (
    <label className={`block text-xs font-medium ${active ? 'text-green-700' : 'text-neutral-500'}`}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-neutral-800 ${
          active ? 'border-green-400 bg-green-50' : 'border-neutral-200'
        }`}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
