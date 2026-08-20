import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import { computePlantingDateSuspicion, computeWeedSuspicion } from '../../features/fields/aiInsights'
import type { CompareGroupKey } from '../../features/fields/compare'
import type { StatCardKey } from '../../features/fields/computeFieldStats'
import { filterFields } from '../../features/fields/filterFields'
import { useFieldsData, useGeoByCode, useScopedFields, useStageResolver } from '../../features/fields/useFieldsData'
import { useOfficers } from '../../features/officers/useOfficers'
import { DEFAULT_SCOUT_ANALYTICS_STATE, type ScoutAnalyticsState } from '../../features/fields/scoutAnalytics'
import { useScoutData } from '../../features/scout/useScoutData'
import { AiInsightsView } from './AiInsightsView'
import { AssignScoutModal } from './AssignScoutModal'
import { FieldCardsView } from './FieldCardsView'
import { FieldTableView } from './FieldTableView'
import { ManageAssignmentsModal } from './ManageAssignmentsModal'
import { OverviewView } from './OverviewView'
import { EMPTY_FILTERS, Sidebar, type SidebarFilters } from './Sidebar'
import { StageSummaryView } from './StageSummaryView'
import { StatRow } from './StatRow'
import { TabBar, TabPanel, type TabKey } from './TabBar'

// Lazily loaded — each pulls in a large third-party dependency (Leaflet,
// Chart.js, or SheetJS/xlsx) not needed for the app's default landing tab
// (Executive Summary) or its lightweight tabs (Cards/Table/Summary), so
// deferring them keeps first paint after login fast. Named exports need the
// `.then(m => ({ default: m.X }))` reshape since React.lazy only accepts a
// module with a `default` export.
const CompareView = lazy(() => import('./CompareView').then((m) => ({ default: m.CompareView })))
const FieldMapView = lazy(() => import('./FieldMapView').then((m) => ({ default: m.FieldMapView })))
const HealthTrendView = lazy(() => import('./HealthTrendView').then((m) => ({ default: m.HealthTrendView })))
const NdviTrendView = lazy(() => import('./NdviTrendView').then((m) => ({ default: m.NdviTrendView })))
const ScoutAnalyticsView = lazy(() => import('./ScoutAnalyticsView').then((m) => ({ default: m.ScoutAnalyticsView })))
const ExecutiveReportView = lazy(() => import('./ExecutiveReportView').then((m) => ({ default: m.ExecutiveReportView })))
const ExportModal = lazy(() => import('./ExportModal').then((m) => ({ default: m.ExportModal })))
const ImportFieldsModal = lazy(() => import('./ImportFieldsModal').then((m) => ({ default: m.ImportFieldsModal })))
const ThresholdsModal = lazy(() => import('./ThresholdsModal').then((m) => ({ default: m.ThresholdsModal })))
const ManageOfficersModal = lazy(() =>
  import('./ManageOfficersModal').then((m) => ({ default: m.ManageOfficersModal })),
)
const MasterDataModal = lazy(() => import('./MasterDataModal').then((m) => ({ default: m.MasterDataModal })))

function TabLoadingFallback() {
  return <div className="p-10 text-center text-sm text-neutral-400">Loading…</div>
}

/** App shell: top nav, filter sidebar, stat row, tab shell — ports the
 * structural chrome of RS_Cane_Monitoring_S1.html:610-870. */
export function DashboardShell() {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const fieldsQuery = useFieldsData()
  const scopedFields = useScopedFields()
  const geoByCode = useGeoByCode()
  const stageResolver = useStageResolver()
  const scoutQuery = useScoutData()
  const officersQuery = useOfficers()

  const [filters, setFilters] = useState<SidebarFilters>(EMPTY_FILTERS)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [statFilter, setStatFilter] = useState<StatCardKey | null>(null)
  const [mapFocusPlot, setMapFocusPlot] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [scoutModeActive, setScoutModeActive] = useState(false)
  const [scoutSelected, setScoutSelected] = useState<Set<string>>(new Set())
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [manageAssignmentsOpen, setManageAssignmentsOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [thresholdsModalOpen, setThresholdsModalOpen] = useState(false)
  const [manageOfficersModalOpen, setManageOfficersModalOpen] = useState(false)
  const [masterDataModalOpen, setMasterDataModalOpen] = useState(false)
  const [scoutAnalyticsState, setScoutAnalyticsState] = useState<ScoutAnalyticsState>(DEFAULT_SCOUT_ANALYTICS_STATE)

  const canImportFields = user?.isSuperAdmin ?? false
  const isSuperAdmin = user?.isSuperAdmin ?? false

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

  // Field Cards' "check weed"/"check planting date" alerts reuse the exact
  // same AI Insights heuristics rather than a second copy — a field flagged
  // here is the same field that would show up in the AI Insights tab's
  // Fields of Suspicion list. Weed needs scout data loaded (to apply the
  // "scout already cleared it" override); planting date doesn't.
  const weedSuspicionCodes = useMemo(() => {
    if (!scoutQuery.isSuccess) return new Set<string>()
    return new Set(computeWeedSuspicion(filteredFields, geoByCode, scoutQuery.data, stageResolver).map((w) => w.field.code))
  }, [filteredFields, geoByCode, scoutQuery.isSuccess, scoutQuery.data, stageResolver])
  // Map (not just a Set) so the card alert can show WHICH of the two
  // planting-date signatures fired and why — a field flagged by the
  // late-immature-for-recorded-stage rule looks nothing like one flagged
  // by the early-germination rule, and showing just a bare "check planting
  // date" badge for both was confusing (a user reasoning about the
  // germination-window rule had no way to tell the flag was actually
  // coming from the other one).
  const plantingSuspicionNotes = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of computePlantingDateSuspicion(filteredFields, geoByCode, stageResolver)) map.set(p.field.code, p.note)
    return map
  }, [filteredFields, geoByCode, stageResolver])

  // Preserves every other sidebar filter (client/factory/division/etc.) —
  // only the plot-selection fields themselves get overwritten, clearing
  // each other so they don't combine into an impossible AND (e.g. plot='X'
  // together with a leftover plots=['Y','Z'] from an earlier jump). Safe to
  // preserve the rest unconditionally: whatever plot code(s) got jumped to
  // here were already computed FROM the currently-filtered field list, so
  // re-applying those same filters can never hide the very plot(s) being
  // jumped to. Real user-reported bug, 2026-08-01: resetting via
  // EMPTY_FILTERS meant clicking a Scout Analytics bar segment silently
  // dropped an active Client/Factory selection, so returning to that tab
  // afterward showed unfiltered data instead of what the user had set up.
  const viewPlotInCards = (plotCode: string) => {
    setFilters((prev) => ({ ...prev, plot: plotCode, plots: [] }))
    setActiveTab('cards')
  }

  const viewPlotsInCards = (plotCodes: string[]) => {
    setFilters((prev) => ({ ...prev, plots: plotCodes, plot: '' }))
    setActiveTab('cards')
  }

  const viewPlotOnMap = (plotCode: string) => {
    setMapFocusPlot(plotCode)
    setActiveTab('map')
  }

  const viewGroupInCards = (groupKey: CompareGroupKey, groupValue: string) => {
    switch (groupKey) {
      case 'client':
        setFilters({ ...EMPTY_FILTERS, client: groupValue })
        break
      case 'factory':
        setFilters({ ...EMPTY_FILTERS, factory: groupValue })
        break
      case 'division':
        setFilters({ ...EMPTY_FILTERS, division: groupValue })
        break
      case 'section':
        setFilters({ ...EMPTY_FILTERS, section: groupValue })
        break
      case 'farmer':
        setFilters({ ...EMPTY_FILTERS, farmers: [groupValue] })
        break
      case 'plotType':
        setFilters({ ...EMPTY_FILTERS, plotType: groupValue })
        break
      case 'stage':
        setFilters({ ...EMPTY_FILTERS, cropStage: groupValue })
        break
      case 'variety':
        setFilters({ ...EMPTY_FILTERS, variety: groupValue })
        break
    }
    setActiveTab('cards')
  }

  // "Assign Scout" — ports source's openScoutMode()/scoutSelected
  // (RS_Cane_Monitoring_S1.html:6037-6113): checkbox-select fields on the
  // Cards tab, then assign them to a real officer via AssignScoutModal.
  const startScoutMode = () => {
    setScoutModeActive(true)
    setScoutSelected(new Set())
    setMapFocusPlot(null)
    setFilters((prev) => (prev.plot || prev.plots.length > 0 ? { ...prev, plot: '', plots: [] } : prev))
    setActiveTab('cards')
  }
  const exitScoutMode = () => {
    setScoutModeActive(false)
    setScoutSelected(new Set())
    setAssignModalOpen(false)
  }
  const toggleScoutSelect = (plotCode: string) => {
    setScoutSelected((prev) => {
      const next = new Set(prev)
      if (next.has(plotCode)) next.delete(plotCode)
      else next.add(plotCode)
      return next
    })
  }

  // Clicking a tab button directly (as opposed to "View on Map" / "View N
  // in Field cards") should always land on the default fit-all view, not a
  // stale focused field or plot-selection left over from a previous jump.
  // Without this, tapping a Change Detection card in AI Insights (which
  // sets filters.plots and jumps to Field Cards) left that plot filter
  // silently applied when the user clicked back to AI Insights directly —
  // AI Insights kept computing off the narrowed subset with no visible way
  // to "unselect" it. Only the two jump-only filter fields are cleared
  // here; a deliberate drill-down filter (e.g. Compare's "view this client
  // in cards") is left alone since that one's meant to persist across tabs.
  //
  // Exception: moving directly between Cards and Table doesn't clear the
  // plot selection — both are just different views of the same field list,
  // so a Scout Analytics segment click (jumps to Cards, filtered to those
  // plots) should still show that same narrowed list if the user switches
  // to Table right after, not silently widen back to the full KPI filter.
  // Real user report, 2026-08-01.
  const handleTabSelect = (tab: TabKey) => {
    setMapFocusPlot(null)
    const stayingInListView = (activeTab === 'cards' || activeTab === 'table') && (tab === 'cards' || tab === 'table')
    if (!stayingInListView) {
      setFilters((prev) => (prev.plot || prev.plots.length > 0 ? { ...prev, plot: '', plots: [] } : prev))
    }
    if (tab !== 'cards' && scoutModeActive) exitScoutMode()
    setActiveTab(tab)
  }

  const brandName = user?.clientCode ?? 'FarmSignal'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#eef0f3]">
      <nav className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 bg-white px-4 py-3">
        <img src="/logonew.jpg" alt="FarmSignal" className="h-10 w-10 shrink-0 object-contain" />
        <div>
          <div className="text-sm font-bold text-neutral-800">{brandName}</div>
          <div className="text-[10px] font-medium tracking-wide text-neutral-400">
            SMART SUGARCANE MONITORING SYSTEM
          </div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            fieldsQuery.refetch()
            scoutQuery.refetch()
            officersQuery.refetch()
          }}
          disabled={fieldsQuery.isFetching || scoutQuery.isFetching || officersQuery.isFetching}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          title="Refresh field, scout, and officer data now"
        >
          {fieldsQuery.isFetching || scoutQuery.isFetching || officersQuery.isFetching ? '🔄 Refreshing…' : '🔄 Refresh'}
        </button>
        <button
          type="button"
          onClick={startScoutMode}
          className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
          title="Select fields on Field Cards and assign them to an officer"
        >
          🧑‍🌾 Assign Scout
        </button>
        <button
          type="button"
          onClick={() => setManageAssignmentsOpen(true)}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          title="View and cancel currently open scout assignments"
        >
          📋 Assignments
        </button>
        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          title="Export reports for the fields currently in view"
        >
          ⬇ Export
        </button>
        {canImportFields && (
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            title="Bulk-import new plots from a filled-in template"
          >
            ➕ Import Fields
          </button>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setThresholdsModalOpen(true)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            title="Manage per-client/factory crop-stage NDVI thresholds"
          >
            ⚙️ Thresholds
          </button>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setManageOfficersModalOpen(true)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            title="Edit officer roles/scope or deactivate a login"
          >
            👤 Manage Officers
          </button>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setMasterDataModalOpen(true)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            title="Manage Factories/Divisions/Sections/Villages"
          >
            🗂️ Master Data
          </button>
        )}
        {officersQuery.isError && (
          <button
            type="button"
            onClick={() => officersQuery.refetch()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            title="The officer list failed to load — Assign Scout and Export reports may show it as empty. Click to retry."
          >
            ⚠ Officers failed to load — Retry
          </button>
        )}
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

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `${sidebarCollapsed ? 0 : 256}px 16px 1fr`,
          transition: 'grid-template-columns 300ms ease-in-out',
        }}
      >
        <div className="h-full overflow-hidden">
          <div className="h-full w-64 overflow-y-auto">
            <Sidebar
              fields={scopedFields}
              filters={filters}
              onChange={setFilters}
              onOverviewClick={() => setActiveTab('overview')}
              overviewActive={activeTab === 'overview'}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show filters' : 'Hide filters'}
          className="mt-3 flex h-9 w-4 items-center justify-center self-start justify-self-start rounded-r-md border border-l-0 border-neutral-200 bg-white text-[10px] text-neutral-400 shadow-sm hover:bg-neutral-50 hover:text-neutral-600"
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>

        <main className="h-full min-w-0 space-y-4 overflow-y-auto p-4">
          {fieldsQuery.isLoading && (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
              Loading field data…
            </div>
          )}
          {fieldsQuery.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
              <div>{fieldsQuery.error instanceof Error ? fieldsQuery.error.message : 'Failed to load field data.'}</div>
              <button
                type="button"
                onClick={() => fieldsQuery.refetch()}
                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          )}
          {fieldsQuery.isSuccess && (
            <>
              {fieldsQuery.data.boundariesFailed && (
                <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span>
                    ⚠ Map boundaries failed to load — every plot may show as "Not Mapped" until this is retried, even
                    ones that really have a GPS survey.
                  </span>
                  <button
                    type="button"
                    onClick={() => fieldsQuery.refetch()}
                    className="ml-3 shrink-0 rounded border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-100"
                  >
                    Retry
                  </button>
                </div>
              )}
              <StatRow
                fields={sidebarFilteredFields}
                geoByCode={geoByCode}
                activeFilter={statFilter}
                onSelectFilter={setStatFilter}
              />
              <div>
                <TabBar active={activeTab} onSelect={handleTabSelect} />
                <div className="rounded-b-md border border-t-0 border-neutral-200 bg-white">
                  <Suspense fallback={<TabLoadingFallback />}>
                  {activeTab === 'overview' &&
                    (scoutQuery.isSuccess ? (
                      <OverviewView
                        fields={sidebarFilteredFields}
                        geoByCode={geoByCode}
                        scoutData={scoutQuery.data}
                        onViewGroupInCards={viewGroupInCards}
                      />
                    ) : (
                      <div className="p-10 text-center text-sm text-neutral-400">
                        {scoutQuery.isLoading ? (
                          'Loading scout data…'
                        ) : (
                          <>
                            Failed to load scout data.{' '}
                            <button
                              type="button"
                              onClick={() => scoutQuery.refetch()}
                              className="font-semibold text-green-700 hover:underline"
                            >
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {activeTab === 'trend' && (
                    <HealthTrendView fields={filteredFields} geoByCode={geoByCode} seasons={filters.seasons} />
                  )}
                  {activeTab === 'compare' && (
                    <CompareView
                      fields={filteredFields}
                      geoByCode={geoByCode}
                      seasons={filters.seasons}
                      onViewGroupInCards={viewGroupInCards}
                    />
                  )}
                  {activeTab === 'scoutAnalytics' &&
                    (scoutQuery.isSuccess ? (
                      <ScoutAnalyticsView
                        fields={filteredFields}
                        geoByCode={geoByCode}
                        scoutData={scoutQuery.data}
                        onViewPlotsInCards={viewPlotsInCards}
                        state={scoutAnalyticsState}
                        onStateChange={(patch) => setScoutAnalyticsState((prev) => ({ ...prev, ...patch }))}
                      />
                    ) : (
                      <div className="p-10 text-center text-sm text-neutral-400">
                        {scoutQuery.isLoading ? (
                          'Loading scout data…'
                        ) : (
                          <>
                            Failed to load scout data.{' '}
                            <button
                              type="button"
                              onClick={() => scoutQuery.refetch()}
                              className="font-semibold text-green-700 hover:underline"
                            >
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {activeTab === 'cards' && (
                    <FieldCardsView
                      fields={filteredFields}
                      geoByCode={geoByCode}
                      includeS1={filters.includeS1}
                      onViewOnMap={viewPlotOnMap}
                      weedSuspicionCodes={weedSuspicionCodes}
                      plantingSuspicionNotes={plantingSuspicionNotes}
                      scoutModeActive={scoutModeActive}
                      scoutSelected={scoutSelected}
                      onToggleScoutSelect={toggleScoutSelect}
                      onSelectAllScout={() => setScoutSelected(new Set(filteredFields.map((f) => f.code)))}
                      onClearScoutSelect={() => setScoutSelected(new Set())}
                      onOpenAssignModal={() => setAssignModalOpen(true)}
                      onExitScoutMode={exitScoutMode}
                    />
                  )}
                  {activeTab === 'table' && <FieldTableView fields={filteredFields} geoByCode={geoByCode} />}
                  {activeTab === 'summary' && (
                    <StageSummaryView
                      fields={filteredFields}
                      geoByCode={geoByCode}
                      onViewPlotInCards={viewPlotInCards}
                      onViewPlotsInCards={viewPlotsInCards}
                    />
                  )}
                  {activeTab === 'chart' && (
                    <NdviTrendView fields={filteredFields} geoByCode={geoByCode} seasons={filters.seasons} />
                  )}
                  {activeTab === 'map' && (
                    <FieldMapView fields={filteredFields} geoByCode={geoByCode} focusPlotCode={mapFocusPlot} includeS1={filters.includeS1} />
                  )}
                  {activeTab === 'insights' &&
                    (scoutQuery.isSuccess ? (
                      <AiInsightsView
                        fields={filteredFields}
                        geoByCode={geoByCode}
                        scoutData={scoutQuery.data}
                        onViewPlotsInCards={viewPlotsInCards}
                      />
                    ) : (
                      <div className="p-10 text-center text-sm text-neutral-400">
                        {scoutQuery.isLoading ? (
                          'Loading scout data…'
                        ) : (
                          <>
                            Failed to load scout data.{' '}
                            <button
                              type="button"
                              onClick={() => scoutQuery.refetch()}
                              className="font-semibold text-green-700 hover:underline"
                            >
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {activeTab === 'execReport' &&
                    (scoutQuery.isSuccess ? (
                      <ExecutiveReportView
                        fields={sidebarFilteredFields}
                        geoByCode={geoByCode}
                        scoutData={scoutQuery.data}
                        onViewPlotsInCards={viewPlotsInCards}
                      />
                    ) : (
                      <div className="p-10 text-center text-sm text-neutral-400">
                        {scoutQuery.isLoading ? (
                          'Loading scout data…'
                        ) : (
                          <>
                            Failed to load scout data.{' '}
                            <button
                              type="button"
                              onClick={() => scoutQuery.refetch()}
                              className="font-semibold text-green-700 hover:underline"
                            >
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {activeTab !== 'overview' &&
                    activeTab !== 'trend' &&
                    activeTab !== 'compare' &&
                    activeTab !== 'scoutAnalytics' &&
                    activeTab !== 'cards' &&
                    activeTab !== 'table' &&
                    activeTab !== 'summary' &&
                    activeTab !== 'chart' &&
                    activeTab !== 'map' &&
                    activeTab !== 'insights' &&
                    activeTab !== 'execReport' && <TabPanel tab={activeTab} />}
                  </Suspense>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {assignModalOpen && (
        <AssignScoutModal
          plotCodes={[...scoutSelected]}
          fields={filteredFields}
          onClose={() => setAssignModalOpen(false)}
          onAssigned={exitScoutMode}
        />
      )}

      {manageAssignmentsOpen && (
        <ManageAssignmentsModal fields={scopedFields} onClose={() => setManageAssignmentsOpen(false)} />
      )}

      {exportModalOpen && (
        <Suspense fallback={null}>
          <ExportModal
            fields={filteredFields}
            geoByCode={geoByCode}
            scoutData={scoutQuery.data}
            officers={officersQuery.data ?? []}
            onClose={() => setExportModalOpen(false)}
          />
        </Suspense>
      )}

      {importModalOpen && (
        <Suspense fallback={null}>
          <ImportFieldsModal
            onClose={() => setImportModalOpen(false)}
            onImported={() => {
              setImportModalOpen(false)
              queryClient.invalidateQueries({ queryKey: ['fields-data'] })
            }}
          />
        </Suspense>
      )}

      {thresholdsModalOpen && (
        <Suspense fallback={null}>
          <ThresholdsModal
            onClose={() => {
              setThresholdsModalOpen(false)
              queryClient.invalidateQueries({ queryKey: ['fields-data'] })
            }}
          />
        </Suspense>
      )}

      {manageOfficersModalOpen && (
        <Suspense fallback={null}>
          <ManageOfficersModal
            onClose={() => {
              setManageOfficersModalOpen(false)
              queryClient.invalidateQueries({ queryKey: ['officers'] })
            }}
          />
        </Suspense>
      )}

      {masterDataModalOpen && (
        <Suspense fallback={null}>
          <MasterDataModal
            onClose={() => {
              setMasterDataModalOpen(false)
              queryClient.invalidateQueries({ queryKey: ['fields-data'] })
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
