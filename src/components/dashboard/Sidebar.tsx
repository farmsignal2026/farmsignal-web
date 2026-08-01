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
  /** "Include S1 (SAR) estimates" — off by default, matching source's
   * `includeS1Data`. S1 (radar) readings are a cloudy-period gap-fill
   * estimate, not a real optical measurement; a plot that has NEVER had a
   * real S2 reading is excluded entirely rather than shown with an
   * estimated value, unless this is switched on. */
  includeS1: boolean
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
  includeS1: false,
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
        className={`w-full rounded-lg px-3 py-2.5 text-sm font-bold shadow-sm transition ${
          overviewActive
            ? 'bg-gradient-to-br from-green-500 to-green-400 text-white ring-2 ring-green-200 ring-offset-1'
            : 'border border-neutral-200 bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        📊 Executive Summary
      </button>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-neutral-500">🔎 Filters</div>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-[11px] font-medium text-neutral-500 hover:text-green-700 hover:underline"
          >
            ↺ Reset filters
          </button>
        </div>
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
          <label
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium ${
              filters.includeS1 ? 'border-green-400 bg-green-50 text-green-700' : 'border-neutral-200 text-neutral-600'
            }`}
            title="S1 (SAR) readings are a gap-fill estimate for cloudy periods, not a real optical measurement. Off by default — a plot with only S1 data and no real satellite reading is treated as having no data, rather than showing an estimate."
          >
            <input
              type="checkbox"
              checked={filters.includeS1}
              onChange={(e) => set({ includeS1: e.target.checked })}
            />
            SAR estimate
          </label>
        </div>
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
