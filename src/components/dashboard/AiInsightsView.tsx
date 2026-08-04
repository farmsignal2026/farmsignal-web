import { useMemo, useState, type ReactNode } from 'react'
import {
  computeChangeDetection,
  computeFarmerPerformance,
  computePlantingDateSuspicion,
  computePlotScores,
  computeScoutRecommendation,
  computeWeedSuspicion,
  topBottomPlots,
  type ChangeDetectionEntry,
  type FarmerPerformanceEntry,
  type PlotScore,
} from '../../features/fields/aiInsights'
import { areaFor } from '../../features/fields/computeFieldStats'
import type { Field, FieldGeo } from '../../features/fields/types'
import type { ScoutData } from '../../features/scout/types'

interface AiInsightsViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  scoutData: ScoutData
  onViewPlotsInCards: (plotCodes: string[]) => void
}

type SectionKey = 'change' | 'suspicion' | 'scout' | 'farmer' | 'plots'

/** AI Insights tab — deliberately NOT a port of the source HTML's own AI
 * Insights (Tier1 trajectory + Tier2 pattern classifier); five features the
 * user asked for instead, each answering a question the rest of the app
 * doesn't: what changed recently, which fields' data looks suspicious
 * rather than genuinely unhealthy, what to actually tell a scout to look
 * for, and who's performing well. See the plan doc for the full reasoning
 * behind each heuristic's thresholds.
 *
 * Each section is a collapsible card rather than always-rendered — per user
 * feedback the always-expanded layout made for a long scroll to reach
 * anything past the first section. Only Change Detection (the one-glance
 * headline) starts open; the rest start collapsed and the user expands
 * whichever they actually want, via its own header or the sticky nav. */
export function AiInsightsView({ fields, geoByCode, scoutData, onViewPlotsInCards }: AiInsightsViewProps) {
  const changeDetection = useMemo(() => computeChangeDetection(fields, geoByCode), [fields, geoByCode])
  const weedSuspicion = useMemo(() => computeWeedSuspicion(fields, geoByCode, scoutData), [fields, geoByCode, scoutData])
  const plantingSuspicion = useMemo(() => computePlantingDateSuspicion(fields, geoByCode), [fields, geoByCode])
  const scoutRecommendations = useMemo(
    () => computeScoutRecommendation(fields, scoutData),
    [fields, scoutData],
  )
  const plotScores = useMemo(() => computePlotScores(fields, geoByCode), [fields, geoByCode])
  const farmerPerformance = useMemo(
    () => computeFarmerPerformance(fields, geoByCode, scoutData, changeDetection),
    [fields, geoByCode, scoutData, changeDetection],
  )
  const { top: topPlots, bottom: bottomPlots } = useMemo(() => topBottomPlots(plotScores, 10), [plotScores])

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    change: true,
    suspicion: false,
    scout: false,
    farmer: false,
    plots: false,
  })
  const toggleSection = (key: SectionKey) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  const navigateToSection = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: true }))
    scrollToSection(SECTION_IDS[key])
  }

  return (
    <div className="space-y-6 p-4">
      <div id={SECTION_IDS.change} />
      <ChangeDetectionSection
        changeDetection={changeDetection}
        geoByCode={geoByCode}
        onViewPlotsInCards={onViewPlotsInCards}
        expanded={expanded.change}
        onToggle={() => toggleSection('change')}
      />
      <SectionNav onNavigate={navigateToSection} />
      <SuspicionSection
        weedSuspicion={weedSuspicion}
        plantingSuspicion={plantingSuspicion}
        onViewPlotsInCards={onViewPlotsInCards}
        expanded={expanded.suspicion}
        onToggle={() => toggleSection('suspicion')}
      />
      <ScoutRecommendationSection
        entries={scoutRecommendations}
        onViewPlotsInCards={onViewPlotsInCards}
        expanded={expanded.scout}
        onToggle={() => toggleSection('scout')}
      />
      <FarmerPerformanceSection
        entries={farmerPerformance}
        onViewPlotsInCards={onViewPlotsInCards}
        expanded={expanded.farmer}
        onToggle={() => toggleSection('farmer')}
      />
      <TopBottomPlotsSection
        top={topPlots}
        bottom={bottomPlots}
        total={plotScores.length}
        onViewPlotsInCards={onViewPlotsInCards}
        expanded={expanded.plots}
        onToggle={() => toggleSection('plots')}
      />
    </div>
  )
}

/** Anchors each "jump to section" link/back-to-top link scrolls to —
 * ported as a plain scrollIntoView jump list since the tab has no router,
 * per user request to cut down on the long scroll to reach the later
 * sections. */
const SECTION_IDS: Record<SectionKey, string> = {
  change: 'ai-insights-top',
  suspicion: 'ai-insights-suspicion',
  scout: 'ai-insights-scout',
  farmer: 'ai-insights-farmer',
  plots: 'ai-insights-plots',
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Sticks to the top of the viewport while scrolling so a section is
 * reachable — and auto-expanded — in one click from anywhere on the tab. */
function SectionNav({ onNavigate }: { onNavigate: (key: SectionKey) => void }) {
  const links: { key: SectionKey; label: string }[] = [
    { key: 'suspicion', label: 'Fields of Suspicion' },
    { key: 'scout', label: 'Scout Recommendations' },
    { key: 'farmer', label: 'Farmer Performance Rank' },
    { key: 'plots', label: 'Top 10 / Bottom 10 Plots' },
  ]
  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur">
      {links.map((link) => (
        <button
          key={link.key}
          type="button"
          onClick={() => onNavigate(link.key)}
          className="text-[11px] font-bold uppercase tracking-wide text-neutral-800 hover:text-green-700"
        >
          {link.label}
        </button>
      ))}
    </div>
  )
}

function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => scrollToSection(SECTION_IDS.change)}
      className="text-[10px] font-medium text-neutral-400 hover:text-green-700"
    >
      ↑ Back to top
    </button>
  )
}

function SummaryCard({
  id,
  title,
  subtitle,
  count,
  expanded,
  onToggle,
  children,
  onBackToTop,
}: {
  id?: string
  title: string
  subtitle?: string
  count?: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  onBackToTop?: boolean
}) {
  return (
    <div id={id} className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          <span className={`text-neutral-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">{count}</span>
          )}
        </button>
        {onBackToTop && expanded && <BackToTop />}
      </div>
      {expanded && (
        <>
          {subtitle && <div className="mb-3 mt-1.5 text-[11px] text-neutral-400">{subtitle}</div>}
          <div className={subtitle ? '' : 'mt-3'}>{children}</div>
        </>
      )}
    </div>
  )
}

function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  return { selected, setSelected, toggle }
}

function SelectionHeader({
  codes,
  selected,
  onChange,
  onViewSelected,
}: {
  codes: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  onViewSelected: () => void
}) {
  if (codes.length === 0) return null
  const allSelected = codes.every((c) => selected.has(c))
  return (
    <div className="mb-2 flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onChange(allSelected ? new Set() : new Set(codes))}
          className="h-3.5 w-3.5 rounded border-neutral-300"
        />
        Select all ({codes.length})
      </label>
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onViewSelected}
          className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700"
        >
          View {selected.size} in Field cards →
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Change Detection
// ---------------------------------------------------------------------------

function ChangeDetectionSection({
  changeDetection,
  geoByCode,
  onViewPlotsInCards,
  expanded,
  onToggle,
}: {
  changeDetection: ReturnType<typeof computeChangeDetection>
  geoByCode: Record<string, FieldGeo>
  onViewPlotsInCards: (codes: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const buckets: { key: 'improved' | 'unchanged' | 'deteriorated'; label: string; entries: ChangeDetectionEntry[]; color: string }[] = [
    { key: 'improved', label: 'Improved', entries: changeDetection.improved, color: 'text-green-600' },
    { key: 'unchanged', label: 'Unchanged', entries: changeDetection.unchanged, color: 'text-neutral-500' },
    { key: 'deteriorated', label: 'Declined', entries: changeDetection.deteriorated, color: 'text-red-600' },
  ]
  const totalTracked = buckets.reduce((s, b) => s + b.entries.length, 0)

  return (
    <SummaryCard
      title="Change Detection — last ~15 days"
      subtitle={`${totalTracked} field(s) with a comparable reading from ~15 days ago · NDVI delta ≥ +0.03 improved, ≤ -0.03 declined, else unchanged`}
      count={totalTracked}
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {buckets.map((b) => {
          const acres = b.entries.reduce((sum, e) => sum + areaFor(e.field, geoByCode[e.field.code]), 0)
          return (
            <button
              key={b.key}
              type="button"
              disabled={b.entries.length === 0}
              onClick={() => onViewPlotsInCards(b.entries.map((e) => e.field.code))}
              className="rounded-lg border border-neutral-200 p-3 text-left hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white"
            >
              <div className="text-[11px] font-medium text-neutral-500">{b.label}</div>
              <div className={`text-2xl font-bold ${b.color}`}>{b.entries.length}</div>
              <div className="text-[11px] text-neutral-400">{acres.toFixed(1)} acres</div>
            </button>
          )
        })}
      </div>
    </SummaryCard>
  )
}

// ---------------------------------------------------------------------------
// 2. Fields of Suspicion (Weed + Planting date)
// ---------------------------------------------------------------------------

interface SuspicionItem {
  field: Field
  detail: string
}

/** Two independent sub-lists rather than one merged list with badges —
 * per user request, Weed and Planting Date suspicion are different
 * questions with different follow-up actions, so they get separate
 * selection state and their own "View N in Field cards" action, same
 * side-by-side pattern as Farmer Performance's Top/Bottom 10. */
function SuspicionSection({
  weedSuspicion,
  plantingSuspicion,
  onViewPlotsInCards,
  expanded,
  onToggle,
}: {
  weedSuspicion: ReturnType<typeof computeWeedSuspicion>
  plantingSuspicion: ReturnType<typeof computePlantingDateSuspicion>
  onViewPlotsInCards: (codes: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const weedSelection = useSelection()
  const plantingSelection = useSelection()

  const weedItems = useMemo<SuspicionItem[]>(
    () =>
      weedSuspicion.map((w) => ({
        field: w.field,
        detail: `NDVI ${w.ndvi.toFixed(2)} — ${(w.excess >= 0 ? '+' : '')}${w.excess.toFixed(2)} above ${w.stageName} max · ${w.scoutWeedStatus !== null ? `Scouted Weed: ${w.scoutWeedStatus}` : 'Scout: Weed, not yet scouted'}`,
      })),
    [weedSuspicion],
  )
  const plantingItems = useMemo<SuspicionItem[]>(
    () => plantingSuspicion.map((p) => ({ field: p.field, detail: p.note })),
    [plantingSuspicion],
  )

  return (
    <SummaryCard
      id={SECTION_IDS.suspicion}
      title="Fields of Suspicion"
      subtitle="Data-quality flags, not necessarily a real health problem — an abnormal NDVI signal worth a second look before trusting the health label."
      count={weedItems.length + plantingItems.length}
      expanded={expanded}
      onToggle={onToggle}
      onBackToTop
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SuspicionList
          title="Weed Suspicion"
          items={weedItems}
          selection={weedSelection}
          emptyMessage="No fields currently flagged for weed suspicion."
          onViewPlotsInCards={onViewPlotsInCards}
        />
        <SuspicionList
          title="Planting Date Suspicion"
          items={plantingItems}
          selection={plantingSelection}
          emptyMessage="No fields currently flagged for planting date suspicion."
          onViewPlotsInCards={onViewPlotsInCards}
        />
      </div>
    </SummaryCard>
  )
}

function SuspicionList({
  title,
  items,
  selection,
  emptyMessage,
  onViewPlotsInCards,
}: {
  title: string
  items: SuspicionItem[]
  selection: ReturnType<typeof useSelection>
  emptyMessage: string
  onViewPlotsInCards: (codes: string[]) => void
}) {
  const { selected, setSelected, toggle } = selection
  const codes = items.map((i) => i.field.code)

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-neutral-500">
        {title} <span className="font-bold text-neutral-700">({items.length})</span>
      </div>
      <SelectionHeader
        codes={codes}
        selected={selected}
        onChange={setSelected}
        onViewSelected={() => onViewPlotsInCards([...selected])}
      />
      {items.length === 0 ? (
        <div className="py-2 text-xs text-neutral-400">{emptyMessage}</div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {items.map((item) => (
            <div key={item.field.code} className="flex items-center gap-2 py-2 hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={selected.has(item.field.code)}
                onChange={() => toggle(item.field.code)}
                className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300"
                aria-label={`Select ${item.field.name}`}
              />
              <button
                type="button"
                onClick={() => onViewPlotsInCards([item.field.code])}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                title="Open this plot in Field cards"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-neutral-700">
                    {item.field.name} <span className="font-normal text-neutral-400">· {item.field.code}</span>
                  </div>
                  <div className="truncate text-[10px] text-neutral-400">{item.detail}</div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Scout Recommendations
// ---------------------------------------------------------------------------

function ScoutRecommendationSection({
  entries,
  onViewPlotsInCards,
  expanded,
  onToggle,
}: {
  entries: ReturnType<typeof computeScoutRecommendation>
  onViewPlotsInCards: (codes: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const { selected, setSelected, toggle } = useSelection()
  const codes = entries.map((e) => e.field.code)

  return (
    <SummaryCard
      id={SECTION_IDS.scout}
      title="Scout Recommendations"
      subtitle="Need Attention / Need Serious Attention fields, with the specific flagged reason from their latest scout visit — not just the NDVI threshold label."
      count={entries.length}
      expanded={expanded}
      onToggle={onToggle}
      onBackToTop
    >
      <SelectionHeader
        codes={codes}
        selected={selected}
        onChange={setSelected}
        onViewSelected={() => onViewPlotsInCards([...selected])}
      />
      {entries.length === 0 ? (
        <div className="py-2 text-xs text-neutral-400">No fields currently need attention.</div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {entries.map((entry) => (
            <div key={entry.field.code} className="flex items-center gap-2 py-2 hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={selected.has(entry.field.code)}
                onChange={() => toggle(entry.field.code)}
                className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300"
                aria-label={`Select ${entry.field.name}`}
              />
              <button
                type="button"
                onClick={() => onViewPlotsInCards([entry.field.code])}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                title="Open this plot in Field cards"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-neutral-700">
                    {entry.field.name} <span className="font-normal text-neutral-400">· {entry.field.code}</span>
                  </div>
                  <div className="truncate text-[10px] text-neutral-400">{entry.reason}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    entry.severity === 'serious' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-100 text-amber-800 border border-amber-100'
                  }`}
                >
                  {entry.severity === 'serious' ? 'Serious' : 'Attention'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </SummaryCard>
  )
}

// ---------------------------------------------------------------------------
// 4. Farmer Performance Rank
// ---------------------------------------------------------------------------

function FarmerPerformanceSection({
  entries,
  onViewPlotsInCards,
  expanded,
  onToggle,
}: {
  entries: FarmerPerformanceEntry[]
  onViewPlotsInCards: (codes: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const [expandedFarmer, setExpandedFarmer] = useState<string | null>(null)
  const topSelection = useSelection()
  const bottomSelection = useSelection()
  const top10 = entries.slice(0, 10)
  const bottom10 = [...entries].slice(-10).reverse()

  return (
    <SummaryCard
      id={SECTION_IDS.farmer}
      title="Farmer Performance Rank"
      subtitle="Ranked by average stage-normalized score across their plots. Click a farmer to see their individual plot scores."
      count={entries.length}
      expanded={expanded}
      onToggle={onToggle}
      onBackToTop
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FarmerRankList
          title="Top 10"
          entries={top10}
          expanded={expandedFarmer}
          onToggleExpand={(f) => setExpandedFarmer(expandedFarmer === f ? null : f)}
          selection={topSelection}
          onViewPlotsInCards={onViewPlotsInCards}
        />
        <FarmerRankList
          title="Bottom 10"
          entries={bottom10}
          expanded={expandedFarmer}
          onToggleExpand={(f) => setExpandedFarmer(expandedFarmer === f ? null : f)}
          selection={bottomSelection}
          onViewPlotsInCards={onViewPlotsInCards}
        />
      </div>
    </SummaryCard>
  )
}

/** Selecting a farmer selects ALL of their plots at once — a checkbox per
 * farmer row (not per individual plot), since "view these farmers' fields
 * together in Field Cards" is the useful action here, matching the same
 * checkbox + "View N in Field cards" pattern already used by Fields of
 * Suspicion and Scout Recommendations. */
function FarmerRankList({
  title,
  entries,
  expanded,
  onToggleExpand,
  selection,
  onViewPlotsInCards,
}: {
  title: string
  entries: FarmerPerformanceEntry[]
  expanded: string | null
  onToggleExpand: (farmer: string) => void
  selection: ReturnType<typeof useSelection>
  onViewPlotsInCards: (codes: string[]) => void
}) {
  const { selected, setSelected, toggle } = selection
  const farmerNames = entries.map((e) => e.farmer)
  const codesFor = (farmers: Iterable<string>) => {
    const byFarmer = new Map(entries.map((e) => [e.farmer, e.plots.map((p) => p.field.code)]))
    return [...farmers].flatMap((f) => byFarmer.get(f) ?? [])
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-neutral-500">{title}</div>
      {entries.length === 0 ? (
        <div className="text-xs text-neutral-400">No data.</div>
      ) : (
        <>
          <SelectionHeader
            codes={farmerNames}
            selected={selected}
            onChange={setSelected}
            onViewSelected={() => onViewPlotsInCards(codesFor(selected))}
          />
          <div className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <div key={entry.farmer}>
                <div className="flex items-center gap-2 py-2 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.farmer)}
                    onChange={() => toggle(entry.farmer)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300"
                    aria-label={`Select ${entry.farmer}`}
                  />
                  <button
                    type="button"
                    onClick={() => onToggleExpand(entry.farmer)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-neutral-700">{entry.farmer}</div>
                      <div className="text-[10px] text-neutral-400">
                        {entry.plots.length} plot(s) · {entry.scoutCoveragePct.toFixed(0)}% scouted ·{' '}
                        <TrendLabel value={entry.avgTrend} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-bold text-neutral-700">{Math.round(entry.avgScore)}</div>
                  </button>
                </div>
                {expanded === entry.farmer && (
                  <div className="mb-2 divide-y divide-neutral-50 rounded-md bg-neutral-50 px-2">
                    {entry.plots.map((p) => (
                      <button
                        key={p.field.code}
                        type="button"
                        onClick={() => onViewPlotsInCards([p.field.code])}
                        className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"
                      >
                        <span className="truncate text-neutral-600">
                          {p.field.code} <span className="text-neutral-400">· {p.stageName}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-neutral-700">{p.score}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TrendLabel({ value }: { value: number }) {
  if (value >= 0.03) return <span className="text-green-600">↑ improving</span>
  if (value <= -0.03) return <span className="text-red-600">↓ declining</span>
  return <span className="text-neutral-400">→ steady</span>
}

// ---------------------------------------------------------------------------
// 5. Top / Bottom 10 Plots
// ---------------------------------------------------------------------------

function TopBottomPlotsSection({
  top,
  bottom,
  total,
  onViewPlotsInCards,
  expanded,
  onToggle,
}: {
  top: PlotScore[]
  bottom: PlotScore[]
  total: number
  onViewPlotsInCards: (codes: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const topSelection = useSelection()
  const bottomSelection = useSelection()

  return (
    <SummaryCard
      id={SECTION_IDS.plots}
      title="Top 10 / Bottom 10 Plots"
      subtitle="Flat plot-level score ranking (stage-normalized NDVI), alongside Health Summary rather than replacing it."
      count={total}
      expanded={expanded}
      onToggle={onToggle}
      onBackToTop
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlotScoreList title="Top 10" plots={top} selection={topSelection} onViewPlotsInCards={onViewPlotsInCards} />
        <PlotScoreList title="Bottom 10" plots={bottom} selection={bottomSelection} onViewPlotsInCards={onViewPlotsInCards} />
      </div>
    </SummaryCard>
  )
}

function PlotScoreList({
  title,
  plots,
  selection,
  onViewPlotsInCards,
}: {
  title: string
  plots: PlotScore[]
  selection: ReturnType<typeof useSelection>
  onViewPlotsInCards: (codes: string[]) => void
}) {
  const { selected, setSelected, toggle } = selection
  const codes = plots.map((p) => p.field.code)

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-neutral-500">{title}</div>
      {plots.length === 0 ? (
        <div className="text-xs text-neutral-400">No data.</div>
      ) : (
        <>
          <SelectionHeader
            codes={codes}
            selected={selected}
            onChange={setSelected}
            onViewSelected={() => onViewPlotsInCards([...selected])}
          />
          <div className="divide-y divide-neutral-100">
            {plots.map((p) => (
              <div key={p.field.code} className="flex items-center gap-2 py-1.5 hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={selected.has(p.field.code)}
                  onChange={() => toggle(p.field.code)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-neutral-300"
                  aria-label={`Select ${p.field.name}`}
                />
                <button
                  type="button"
                  onClick={() => onViewPlotsInCards([p.field.code])}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate text-neutral-600">
                    {p.field.name} <span className="text-neutral-400">· {p.field.code} · {p.stageName}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-neutral-700">{p.score}</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
