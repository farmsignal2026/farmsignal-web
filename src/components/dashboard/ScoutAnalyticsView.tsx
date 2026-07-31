import type { Chart as ChartInstance } from 'chart.js'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { Bar } from 'react-chartjs-2'
import { downloadChartExcel, downloadChartPNG, printChartAsPDF } from '../../lib/exportUtils'
import { ExportButtonRow } from './ExportButtonRow'
import {
  SCOUT_GROUP_LABEL,
  SCOUT_OUTCOME_COLOR,
  SCOUT_OUTCOME_LABEL,
  SCOUT_OUTCOMES,
  SCOUT_REASON_CATEGORIES,
  SCOUT_REASON_COLOR,
  SCOUT_STATUS_COLOR,
  SCOUT_STATUSES,
  SCOUT_YIELD_BUCKETS,
  SCOUT_YIELD_COLOR,
  computeScoutFollowup,
  computeScoutReasons,
  computeScoutStatus,
  computeScoutYield,
  type GroupedResult,
  type ScoutGroupKey,
  type ScoutMetric,
  type ScoutView,
} from '../../features/fields/scoutAnalytics'
import type { Field, FieldGeo } from '../../features/fields/types'
import type { ScoutData } from '../../features/scout/types'
import '../../lib/chartSetup'
import { lineStyleLegendLabels } from '../../lib/chartLegend'

interface ScoutAnalyticsViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  scoutData: ScoutData
}

const GROUP_KEYS: ScoutGroupKey[] = ['client', 'factory', 'division', 'farmer', 'plotType', 'stage', 'variety']

const VIEW_LABEL: Record<ScoutView, string> = {
  status: 'Scout Status',
  reasons: 'Scout Reasons',
  followup: 'Follow-up Health',
  yield: 'Expect Yield',
}

/** Scout Analytics tab — 4 views (Scout Status / Scout Reasons / Follow-up
 * Health / Expect Yield) x Compare's full 7 group-by dimensions x Count/%,
 * all rendered as horizontal stacked bars. Ports `renderScoutAnalytics()`
 * (RS_Cane_Monitoring_S1.html:7885-8165), but with Client/Factory already
 * split apart — the source only offers 4 dimensions here with Client/
 * Factory conflated into one "Mill / Client" button, the same bug Compare
 * had before its own fix; deliberately not re-introduced. Scout Reasons
 * also gets a "Top 3 reasons only" toggle (not in source) that limits the
 * stacked segments to the 3 categories with the highest total count across
 * the current filter — a static, simpler alternative to source's dynamic
 * "click a legend item to re-sort by visible categories" interaction
 * (`saResortChartByVisible`), which stays out of scope. Export buttons
 * (Excel/PDF/PNG) ported in Phase 7 — see `exportUtils.ts`. */
export function ScoutAnalyticsView({ fields, geoByCode, scoutData }: ScoutAnalyticsViewProps) {
  const [groupKey, setGroupKey] = useState<ScoutGroupKey>('division')
  const [view, setView] = useState<ScoutView>('status')
  const [metric, setMetric] = useState<ScoutMetric>('count')
  const [top3Only, setTop3Only] = useState(false)
  const chartRef = useRef<ChartInstance<'bar'> | null>(null)

  const result = useMemo<GroupedResult>(() => {
    switch (view) {
      case 'status':
        return computeScoutStatus(fields, geoByCode, groupKey, scoutData)
      case 'reasons':
        return computeScoutReasons(fields, geoByCode, groupKey, scoutData)
      case 'yield':
        return computeScoutYield(fields, geoByCode, groupKey, scoutData)
      case 'followup':
        return computeScoutFollowup(fields, geoByCode, groupKey, scoutData)
    }
  }, [view, fields, geoByCode, groupKey, scoutData])

  const { title, subtitle, categories, labels, colors } = useMemo(() => {
    switch (view) {
      case 'status':
        return {
          title: `Scout status by ${SCOUT_GROUP_LABEL[groupKey]}`,
          subtitle: `${result.groupNames.length} ${SCOUT_GROUP_LABEL[groupKey]}(s) · "Overdue" = more than 15 days since the scout visit with no follow-up completed. "Scheduled" isn't shown — that data only lives on the officer's phone.`,
          categories: [...SCOUT_STATUSES] as string[],
          labels: Object.fromEntries(SCOUT_STATUSES.map((s) => [s, s])),
          colors: SCOUT_STATUS_COLOR as Record<string, string>,
        }
      case 'reasons': {
        let cats: string[] = [...SCOUT_REASON_CATEGORIES]
        if (top3Only) {
          const totalFor = (c: string) => result.groupNames.reduce((s, g) => s + (result.buckets[g]?.[c] ?? 0), 0)
          cats = [...cats].sort((a, b) => totalFor(b) - totalFor(a)).slice(0, 3)
        }
        return {
          title: `Scout reasons by ${SCOUT_GROUP_LABEL[groupKey]}${top3Only ? ' — top 3' : ''}`,
          subtitle:
            'Moderate/Severe/Very Severe · latest scout visit per plot' +
            (top3Only ? ' · showing only the 3 most common reasons across the current filter' : ''),
          categories: cats,
          labels: Object.fromEntries(cats.map((c) => [c, c])),
          colors: SCOUT_REASON_COLOR,
        }
      }
      case 'yield':
        return {
          title: `Expect Yield distribution by ${SCOUT_GROUP_LABEL[groupKey]}`,
          subtitle: 'Latest scout visit per plot · lowest (<30) to highest (>50 t/acre)',
          categories: [...SCOUT_YIELD_BUCKETS] as string[],
          labels: Object.fromEntries(SCOUT_YIELD_BUCKETS.map((b) => [b, b])),
          colors: SCOUT_YIELD_COLOR,
        }
      case 'followup':
        return {
          title: `Follow-up health by ${SCOUT_GROUP_LABEL[groupKey]}`,
          subtitle: `${result.groupNames.length} ${SCOUT_GROUP_LABEL[groupKey]}(s) with at least one follow-up visit`,
          categories: [...SCOUT_OUTCOMES] as string[],
          labels: SCOUT_OUTCOME_LABEL as Record<string, string>,
          colors: SCOUT_OUTCOME_COLOR as Record<string, string>,
        }
    }
  }, [view, groupKey, result, top3Only])

  const isPct = metric === 'pct'

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">View</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            {(Object.keys(VIEW_LABEL) as ScoutView[]).map((v) => (
              <ToggleButton key={v} active={view === v} onClick={() => setView(v)}>
                {VIEW_LABEL[v]}
              </ToggleButton>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">Group by</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            {GROUP_KEYS.map((k) => (
              <ToggleButton key={k} active={groupKey === k} onClick={() => setGroupKey(k)}>
                {SCOUT_GROUP_LABEL[k]}
              </ToggleButton>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">View as</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            <ToggleButton active={metric === 'count'} onClick={() => setMetric('count')}>
              Count
            </ToggleButton>
            <ToggleButton active={metric === 'pct'} onClick={() => setMetric('pct')}>
              %
            </ToggleButton>
          </div>
        </div>

        {view === 'reasons' && (
          <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-neutral-600">
            <input
              type="checkbox"
              checked={top3Only}
              onChange={(e) => setTop3Only(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-neutral-300"
            />
            Top 3 reasons only
          </label>
        )}
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-700">{title}</div>
          <div className="text-xs text-neutral-400">{subtitle}</div>
        </div>
        {result.groupNames.length > 0 && (
          <ExportButtonRow
            onPNG={() => downloadChartPNG(chartRef.current, `Scout_Analytics_${view}`)}
            onPDF={() => printChartAsPDF(chartRef.current, title)}
            onExcel={() => downloadChartExcel(chartRef.current, `Scout_Analytics_${view}`)}
          />
        )}
      </div>
      <div className="mb-3" />

      {result.groupNames.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-400">
          No scout data found in the current filter for this view.
        </div>
      ) : (
        <ScoutChart chartRef={chartRef} result={result} categories={categories} labels={labels} colors={colors} isPct={isPct} />
      )}
    </div>
  )
}

function ScoutChart({
  chartRef,
  result,
  categories,
  labels,
  colors,
  isPct,
}: {
  chartRef: RefObject<ChartInstance<'bar'> | null>
  result: GroupedResult
  categories: string[]
  labels: Record<string, string>
  colors: Record<string, string>
  isPct: boolean
}) {
  const { groupNames, buckets } = result

  const valueFor = (group: string, category: string) => {
    const bucket = buckets[group]
    if (!bucket) return 0
    if (!isPct) return bucket[category] ?? 0
    // Status/Yield/Followup buckets carry an explicit `.total` (count of
    // plots in that group); Reasons doesn't — a single plot can be flagged
    // for multiple categories at once, so its "%" is each category's share
    // of the group's own summed flag count instead (ports the source's
    // own bugfix note at :7988-7996).
    const denom = bucket.total !== undefined ? bucket.total : categories.reduce((s, c) => s + (bucket[c] ?? 0), 0)
    return denom ? Math.round(((bucket[category] ?? 0) / denom) * 100) : 0
  }

  return (
    <div style={{ height: 420 }}>
      <Bar
        ref={chartRef}
        data={{
          labels: groupNames,
          datasets: categories.map((cat) => ({
            label: labels[cat] ?? cat,
            backgroundColor: colors[cat] ?? '#9ca3af',
            stack: 'scout',
            data: groupNames.map((g) => valueFor(g, cat)),
          })),
        }}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { size: 11 }, boxWidth: 26, boxHeight: 4, generateLabels: lineStyleLegendLabels },
            },
            tooltip: {
              callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.x}${isPct ? '%' : ''}` },
            },
          },
          scales: {
            y: { stacked: true, ticks: { font: { size: 11 } } },
            x: { stacked: true, beginAtZero: true, max: isPct ? 100 : undefined },
          },
        }}
      />
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium ${active ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
    >
      {children}
    </button>
  )
}
