import { useMemo, useState } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import type { StatCardKey } from '../../features/fields/computeFieldStats'
import { filterFields } from '../../features/fields/filterFields'
import { useFieldsData, useGeoByCode, useScopedFields } from '../../features/fields/useFieldsData'
import { FieldCardsView } from './FieldCardsView'
import { FieldMapView } from './FieldMapView'
import { FieldTableView } from './FieldTableView'
import { HealthTrendView } from './HealthTrendView'
import { NdviTrendView } from './NdviTrendView'
import { EMPTY_FILTERS, Sidebar, type SidebarFilters } from './Sidebar'
import { StageSummaryView } from './StageSummaryView'
import { StatRow } from './StatRow'
import { TabBar, TabPanel, type TabKey } from './TabBar'

/** App shell: top nav, filter sidebar, stat row, tab shell — ports the
 * structural chrome of RS_Cane_Monitoring_S1.html:610-870. */
export function DashboardShell() {
  const { user, signOut } = useAuth()
  const fieldsQuery = useFieldsData()
  const scopedFields = useScopedFields()
  const geoByCode = useGeoByCode()

  const [filters, setFilters] = useState<SidebarFilters>(EMPTY_FILTERS)
  const [activeTab, setActiveTab] = useState<TabKey>('trend')
  const [statFilter, setStatFilter] = useState<StatCardKey | null>(null)
  const [mapFocusPlot, setMapFocusPlot] = useState<string | null>(null)

  // Sidebar-filtered only (no stat-card category applied) — the stat row
  // itself always reflects this, matching renderStats(filteredRows) in the
  // source (RS_Cane_Monitoring_S1.html:3576): sidebar filters change the KPI
  // totals, but clicking a stat card doesn't change the numbers on the
  // cards themselves, only which fields the tab views below show.
  const sidebarFilteredFields = useMemo(
    () => filterFields(scopedFields, filters, null, geoByCode),
    [scopedFields, filters, geoByCode],
  )

  const filteredFields = useMemo(
    () => filterFields(sidebarFilteredFields, filters, statFilter, geoByCode),
    [sidebarFilteredFields, filters, statFilter, geoByCode],
  )

  const viewPlotInCards = (plotCode: string) => {
    setFilters({ ...EMPTY_FILTERS, plot: plotCode })
    setActiveTab('cards')
  }

  const viewPlotOnMap = (plotCode: string) => {
    setMapFocusPlot(plotCode)
    setActiveTab('map')
  }

  // Clicking a tab button directly (as opposed to "View on Map") should
  // always land on the default fit-all view, not a stale focused field
  // left over from a previous "View on Map" click.
  const handleTabSelect = (tab: TabKey) => {
    setMapFocusPlot(null)
    setActiveTab(tab)
  }

  const brandName = user?.clientCode ?? 'FarmSignal'

  return (
    <div className="flex min-h-screen flex-col bg-[#eef0f3]">
      <nav className="flex items-center gap-4 border-b border-neutral-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-bold text-neutral-800">{brandName}</div>
          <div className="text-[10px] font-medium tracking-wide text-neutral-400">
            SMART SUGARCANE MONITORING SYSTEM
          </div>
        </div>
        <div className="flex-1" />
        <div className="text-right text-xs">
          <div className="font-semibold text-neutral-700">{user?.name}</div>
          <div className="text-neutral-400">{user?.roleLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Sign out
        </button>
      </nav>

      <div className="flex flex-1">
        <Sidebar
          fields={scopedFields}
          filters={filters}
          onChange={setFilters}
          onOverviewClick={() => setActiveTab('trend')}
        />

        <main className="flex-1 space-y-4 p-4">
          {fieldsQuery.isLoading && (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
              Loading field data…
            </div>
          )}
          {fieldsQuery.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
              {fieldsQuery.error instanceof Error ? fieldsQuery.error.message : 'Failed to load field data.'}
            </div>
          )}
          {fieldsQuery.isSuccess && (
            <>
              <StatRow
                fields={sidebarFilteredFields}
                geoByCode={geoByCode}
                activeFilter={statFilter}
                onSelectFilter={setStatFilter}
              />
              <div>
                <TabBar active={activeTab} onSelect={handleTabSelect} />
                <div className="rounded-b-md border border-t-0 border-neutral-200 bg-white">
                  {activeTab === 'trend' && <HealthTrendView fields={filteredFields} geoByCode={geoByCode} />}
                  {activeTab === 'cards' && (
                    <FieldCardsView fields={filteredFields} geoByCode={geoByCode} onViewOnMap={viewPlotOnMap} />
                  )}
                  {activeTab === 'table' && <FieldTableView fields={filteredFields} geoByCode={geoByCode} />}
                  {activeTab === 'summary' && (
                    <StageSummaryView
                      fields={filteredFields}
                      geoByCode={geoByCode}
                      onViewPlotInCards={viewPlotInCards}
                    />
                  )}
                  {activeTab === 'chart' && <NdviTrendView fields={filteredFields} geoByCode={geoByCode} />}
                  {activeTab === 'map' && (
                    <FieldMapView fields={filteredFields} geoByCode={geoByCode} focusPlotCode={mapFocusPlot} />
                  )}
                  {activeTab !== 'trend' &&
                    activeTab !== 'cards' &&
                    activeTab !== 'table' &&
                    activeTab !== 'summary' &&
                    activeTab !== 'chart' &&
                    activeTab !== 'map' && <TabPanel tab={activeTab} />}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
