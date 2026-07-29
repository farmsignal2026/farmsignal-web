import { useMemo } from 'react'
import type { Field } from '../../features/fields/types'

export interface SidebarFilters {
  client: string
  factory: string
  division: string
  village: string
  plot: string
}

export const EMPTY_FILTERS: SidebarFilters = { client: '', factory: '', division: '', village: '', plot: '' }

interface SidebarProps {
  fields: Field[]
  filters: SidebarFilters
  onChange: (next: SidebarFilters) => void
  onOverviewClick: () => void
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b))
}

/** Cascading Client/Factory/Division/Village/Plot filters — plain <select>s
 * for now (RS_Cane_Monitoring_S1.html:638-687 uses custom multi-select
 * checkbox dropdowns; deferred until Phase 2 actually filters Field
 * Cards/Table with them). */
export function Sidebar({ fields, filters, onChange, onOverviewClick }: SidebarProps) {
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

  const plotScoped = useMemo(
    () => villageScoped.filter((f) => !filters.village || f.village === filters.village),
    [villageScoped, filters.village],
  )
  const plots = useMemo(() => uniqueSorted(plotScoped.map((f) => f.code)), [plotScoped])

  const set = (patch: Partial<SidebarFilters>) => onChange({ ...filters, ...patch })

  return (
    <aside className="w-64 shrink-0 space-y-4 border-r border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={onOverviewClick}
        className="w-full rounded-lg bg-gradient-to-br from-blue-800 to-blue-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm"
      >
        📊 Overview — Executive Summary
      </button>

      <div>
        <div className="mb-2 text-xs font-semibold text-neutral-500">🔎 Filters</div>
        <div className="space-y-3">
          <FilterSelect
            label="Client"
            value={filters.client}
            options={clients}
            onChange={(v) => set({ client: v, factory: '', division: '', village: '', plot: '' })}
          />
          <FilterSelect
            label="Factory / Mill"
            value={filters.factory}
            options={factories}
            onChange={(v) => set({ factory: v, division: '', village: '', plot: '' })}
          />
          <FilterSelect
            label="Division"
            value={filters.division}
            options={divisions}
            onChange={(v) => set({ division: v, village: '', plot: '' })}
          />
          <FilterSelect
            label="Village"
            value={filters.village}
            options={villages}
            onChange={(v) => set({ village: v, plot: '' })}
          />
          <FilterSelect label="Plot" value={filters.plot} options={plots} onChange={(v) => set({ plot: v })} />
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
  return (
    <label className="block text-xs font-medium text-neutral-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm text-neutral-800"
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
