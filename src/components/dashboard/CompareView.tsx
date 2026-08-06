import type { Chart as ChartInstance } from 'chart.js'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Bar } from 'react-chartjs-2'
import { HEALTH_COLOR_HEX, WATCH_COLOR_HEX } from '../../features/fields/badgeStyles'
import {
  COMPARE_GROUP_LABEL,
  computeCompareCounts,
  computeCompareStageMatrix,
  computeCompareYoY,
  type CompareGroupKey,
} from '../../features/fields/compare'
import { seasonLabelForYear } from '../../features/fields/season'
import type { Field, FieldGeo } from '../../features/fields/types'
import '../../lib/chartSetup'
import { lineStyleLegendLabels } from '../../lib/chartLegend'
import { downloadChartExcel, downloadChartPNG, downloadXLSX, printChartAsPDF, printTableAsPDF } from '../../lib/exportUtils'
import { ExportButtonRow } from './ExportButtonRow'

interface CompareViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  seasons: string[]
  onViewGroupInCards: (groupKey: CompareGroupKey, groupValue: string) => void
}

type ViewAs = 'count' | 'pct' | 'matrix' | 'yoy'

const GROUP_KEYS: CompareGroupKey[] = ['client', 'factory', 'division', 'section', 'farmer', 'plotType', 'stage', 'variety']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultStart(fields: Field[]): string {
  let earliest: Date | null = null
  for (const f of fields) {
    if (f.plantDateRaw && (!earliest || f.plantDateRaw < earliest)) earliest = f.plantDateRaw
  }
  if (earliest) return isoDate(earliest)
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return isoDate(d)
}

const SEASON_ALPHA = ['FF', '99', '55', '33']

/** Ports `compareExportExcel()`'s Stage Matrix branch (:6819-6838) —
 * one row per group: Score + each stage's observation count and average
 * NDVI, in the group's currently-sorted order. */
function buildStageMatrixRows(
  matrix: ReturnType<typeof computeCompareStageMatrix>,
  groupNames: string[],
  groupLabel: string,
): Record<string, unknown>[] {
  return groupNames.map((g) => {
    const row: Record<string, unknown> = { [groupLabel]: g }
    const score = matrix.scores[g]
    row['Score'] = score == null ? '' : Math.round(score)
    for (const stageName of matrix.stageNames) {
      const cell = matrix.cells[g]?.[stageName]
      row[`${stageName} (obs)`] = cell ? cell.total : 0
      row[`${stageName} (avg NDVI)`] = cell && cell.total ? Number((cell.ndviSum / cell.total).toFixed(3)) : ''
    }
    return row
  })
}

/** Compare tab — 6 group-by dimensions x 4 view modes (Count / % / Stage
 * Matrix / Plant Season YoY). Ports `renderCompare()`
 * (RS_Cane_Monitoring_S1.html:7462-7663) and `renderCompareStageMatrix()`
 * (:7288-7460). Unlike Health Trend's YoY, Compare's Period filter applies
 * to every view mode including YoY — the source scopes `latestArr` to the
 * period once, before branching on view mode. */
export function CompareView({ fields, geoByCode, seasons, onViewGroupInCards }: CompareViewProps) {
  const [start, setStart] = useState(() => defaultStart(fields))
  const [startTouched, setStartTouched] = useState(false)
  const [end, setEnd] = useState(isoDate(new Date()))
  const [groupKey, setGroupKey] = useState<CompareGroupKey>('division')
  const [viewAs, setViewAs] = useState<ViewAs>('count')
  const [matrixSortDir, setMatrixSortDir] = useState<'asc' | 'desc'>('desc')
  const chartRef = useRef<ChartInstance<'bar'> | null>(null)
  const matrixTableRef = useRef<HTMLTableElement>(null)

  const yoyEnabled = seasons.length >= 2

  useEffect(() => {
    if (!startTouched) setStart(defaultStart(fields))
  }, [fields, startTouched])

  const { startDate, endDate } = useMemo(() => {
    const s = new Date(start)
    const e = new Date(end)
    e.setHours(23, 59, 59)
    return { startDate: s, endDate: e }
  }, [start, end])

  const rangeValid = startDate <= endDate

  const counts = useMemo(
    () => (rangeValid && (viewAs === 'count' || viewAs === 'pct') ? computeCompareCounts(fields, geoByCode, groupKey, startDate, endDate) : null),
    [rangeValid, viewAs, fields, geoByCode, groupKey, startDate, endDate],
  )

  const matrix = useMemo(
    () =>
      rangeValid && viewAs === 'matrix' && groupKey !== 'stage'
        ? computeCompareStageMatrix(fields, geoByCode, groupKey, startDate, endDate)
        : null,
    [rangeValid, viewAs, groupKey, fields, geoByCode, startDate, endDate],
  )

  const yoy = useMemo(
    () =>
      rangeValid && viewAs === 'yoy' && yoyEnabled
        ? computeCompareYoY(fields, geoByCode, groupKey, startDate, endDate, seasons.map(Number))
        : null,
    [rangeValid, viewAs, yoyEnabled, fields, geoByCode, groupKey, startDate, endDate, seasons],
  )

  const sortedMatrixGroups = useMemo(() => {
    if (!matrix) return []
    const withScore = matrix.groupNames.map((g) => ({ name: g, score: matrix.scores[g] }))
    withScore.sort((a, b) => {
      const av = a.score ?? -Infinity
      const bv = b.score ?? -Infinity
      return matrixSortDir === 'desc' ? bv - av : av - bv
    })
    return withScore
  }, [matrix, matrixSortDir])

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
        <label className="text-xs font-medium text-neutral-500">
          Start
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              setStartTouched(true)
            }}
            className="mt-1 block rounded-md border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          End
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-200 px-2 py-1 text-sm"
          />
        </label>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">Group by</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            {GROUP_KEYS.map((k) => (
              <ToggleButton key={k} active={groupKey === k} onClick={() => setGroupKey(k)}>
                {COMPARE_GROUP_LABEL[k]}
              </ToggleButton>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-neutral-500">View as</div>
          <div className="flex overflow-hidden rounded-md border border-neutral-200">
            <ToggleButton active={viewAs === 'count'} onClick={() => setViewAs('count')}>
              Count
            </ToggleButton>
            <ToggleButton active={viewAs === 'pct'} onClick={() => setViewAs('pct')}>
              %
            </ToggleButton>
            <ToggleButton active={viewAs === 'matrix'} onClick={() => setViewAs('matrix')}>
              Stage Matrix
            </ToggleButton>
            <ToggleButton
              active={viewAs === 'yoy'}
              disabled={!yoyEnabled}
              title={!yoyEnabled ? 'Select 2+ seasons in the Plant Season filter (sidebar) to enable' : undefined}
              onClick={() => setViewAs('yoy')}
            >
              Plant Season (YoY)
            </ToggleButton>
          </div>
        </div>
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-700">Compare by {COMPARE_GROUP_LABEL[groupKey]}</div>
          <div className="text-xs text-neutral-400">
            {viewAs === 'matrix'
              ? 'Per-stage health composition and score, tallied across every reading in the period'
              : viewAs === 'yoy'
                ? `Good / Moderate / Need Attention / Watch %, latest reading in period, by ${[...seasons]
                    .sort((a, b) => Number(a) - Number(b))
                    .map((y) => seasonLabelForYear(Number(y)))
                    .join(' vs ')}`
                : 'Good / Moderate / Need Attention / Watch, latest reading in the selected period'}
          </div>
        </div>
        {rangeValid &&
          ((viewAs === 'matrix' && matrix && matrix.groupNames.length > 0) ||
            (viewAs === 'yoy' && yoy && yoy.groupNames.length > 0) ||
            ((viewAs === 'count' || viewAs === 'pct') && counts && counts.groupNames.length > 0)) && (
            <ExportButtonRow
              showPNG={viewAs !== 'matrix'}
              onPNG={() => downloadChartPNG(chartRef.current, 'Compare_chart')}
              onPDF={() =>
                viewAs === 'matrix'
                  ? printTableAsPDF('Crop health comparison — Stage Matrix', matrixTableRef.current)
                  : printChartAsPDF(chartRef.current, 'Crop health comparison')
              }
              onExcel={() =>
                viewAs === 'matrix' && matrix
                  ? downloadXLSX(
                      'Stage_Matrix',
                      'Stage Matrix',
                      buildStageMatrixRows(matrix, sortedMatrixGroups.map((g) => g.name), COMPARE_GROUP_LABEL[groupKey]),
                    )
                  : downloadChartExcel(chartRef.current, 'Compare_chart')
              }
            />
          )}
      </div>
      <div className="mb-3" />

      {!rangeValid ? (
        <div className="p-10 text-center text-sm text-neutral-400">Start date must be before End date.</div>
      ) : viewAs === 'matrix' ? (
        groupKey === 'stage' ? (
          <div className="p-10 text-center text-sm text-neutral-400">
            Pick a different Group By — grouping by Crop stage isn't meaningful in the Stage Matrix.
          </div>
        ) : !matrix || matrix.groupNames.length === 0 ? (
          <div className="p-10 text-center text-sm text-neutral-400">
            No observations found in this date range for the current filter.
          </div>
        ) : (
          <StageMatrixTable
            tableRef={matrixTableRef}
            matrix={matrix}
            sortedGroups={sortedMatrixGroups}
            sortDir={matrixSortDir}
            onToggleSort={() => setMatrixSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            groupKey={groupKey}
            onViewGroupInCards={onViewGroupInCards}
          />
        )
      ) : viewAs === 'yoy' ? (
        !yoyEnabled ? (
          <div className="p-10 text-center text-sm text-neutral-400">
            Select 2+ seasons in the Plant Season filter (sidebar) to enable this view.
          </div>
        ) : !yoy || yoy.groupNames.length === 0 ? (
          <div className="p-10 text-center text-sm text-neutral-400">
            No fields with NDVI data in the selected seasons for the current filter.
          </div>
        ) : (
          <YoYChart chartRef={chartRef} yoy={yoy} groupKey={groupKey} onViewGroupInCards={onViewGroupInCards} />
        )
      ) : !counts || counts.groupNames.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-400">
          No observations found in this date range for the current filter.
        </div>
      ) : (
        <CountChart chartRef={chartRef} counts={counts} isPct={viewAs === 'pct'} groupKey={groupKey} onViewGroupInCards={onViewGroupInCards} />
      )}
    </div>
  )
}

function CountChart({
  chartRef,
  counts,
  isPct,
  groupKey,
  onViewGroupInCards,
}: {
  chartRef: RefObject<ChartInstance<'bar'> | null>
  counts: ReturnType<typeof computeCompareCounts>
  isPct: boolean
  groupKey: CompareGroupKey
  onViewGroupInCards: (groupKey: CompareGroupKey, groupValue: string) => void
}) {
  const { groupNames, buckets } = counts

  const valueFor = (name: string, key: 'good' | 'optimal' | 'attention' | 'watch') => {
    const b = buckets[name]
    if (!b) return 0
    if (!isPct) return b[key]
    return b.total ? Math.round((b[key] / b.total) * 100) : 0
  }

  return (
    <div style={{ height: 420 }}>
      <Bar
        ref={chartRef}
        data={{
          labels: groupNames,
          datasets: [
            { label: 'Good', backgroundColor: HEALTH_COLOR_HEX.good, stack: 'health', data: groupNames.map((n) => valueFor(n, 'good')) },
            { label: 'Moderate', backgroundColor: HEALTH_COLOR_HEX.optimal, stack: 'health', data: groupNames.map((n) => valueFor(n, 'optimal')) },
            { label: 'Need Attention', backgroundColor: HEALTH_COLOR_HEX.attention, stack: 'health', data: groupNames.map((n) => valueFor(n, 'attention')) },
            { label: 'Watch', backgroundColor: WATCH_COLOR_HEX, stack: 'watch', data: groupNames.map((n) => valueFor(n, 'watch')) },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_evt, elements, chart) => {
            const idx = elements[0]?.index
            if (idx == null) return
            const name = chart.data.labels?.[idx] as string | undefined
            if (name) onViewGroupInCards(groupKey, name)
          },
          onHover: (evt, elements) => {
            const target = evt.native?.target as HTMLElement | undefined
            if (target) target.style.cursor = elements.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { size: 11 }, boxWidth: 26, boxHeight: 4, generateLabels: lineStyleLegendLabels },
            },
            tooltip: {
              callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y}${isPct ? '%' : ''}` },
            },
          },
          scales: {
            x: { stacked: true, ticks: { maxRotation: 45, autoSkip: false } },
            y: { stacked: true, beginAtZero: true, max: isPct ? 100 : undefined, ticks: { stepSize: isPct ? 20 : undefined } },
          },
        }}
      />
    </div>
  )
}

function YoYChart({
  chartRef,
  yoy,
  groupKey,
  onViewGroupInCards,
}: {
  chartRef: RefObject<ChartInstance<'bar'> | null>
  yoy: ReturnType<typeof computeCompareYoY>
  groupKey: CompareGroupKey
  onViewGroupInCards: (groupKey: CompareGroupKey, groupValue: string) => void
}) {
  const { groupNames, seasonLabels, cells } = yoy

  const pctFor = (group: string, season: string, key: 'good' | 'optimal' | 'attention' | 'watch') => {
    const c = cells[group]?.[season]
    if (!c || !c.total) return 0
    return Math.round((c[key] / c.total) * 100)
  }

  const datasets = seasonLabels.flatMap((season, sIdx) => {
    const alpha = SEASON_ALPHA[sIdx % SEASON_ALPHA.length]
    return [
      {
        label: `Good — ${season}`,
        backgroundColor: `${HEALTH_COLOR_HEX.good}${alpha}`,
        stack: `health-${season}`,
        data: groupNames.map((g) => pctFor(g, season, 'good')),
      },
      {
        label: `Moderate — ${season}`,
        backgroundColor: `${HEALTH_COLOR_HEX.optimal}${alpha}`,
        stack: `health-${season}`,
        data: groupNames.map((g) => pctFor(g, season, 'optimal')),
      },
      {
        label: `Need Attention — ${season}`,
        backgroundColor: `${HEALTH_COLOR_HEX.attention}${alpha}`,
        stack: `health-${season}`,
        data: groupNames.map((g) => pctFor(g, season, 'attention')),
      },
      {
        label: `Watch — ${season}`,
        backgroundColor: `${WATCH_COLOR_HEX}${alpha}`,
        stack: `watch-${season}`,
        data: groupNames.map((g) => pctFor(g, season, 'watch')),
      },
    ]
  })

  return (
    <div style={{ height: 440 }}>
      <Bar
        ref={chartRef}
        data={{ labels: groupNames, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          onClick: (_evt, elements, chart) => {
            const idx = elements[0]?.index
            if (idx == null) return
            const name = chart.data.labels?.[idx] as string | undefined
            if (name) onViewGroupInCards(groupKey, name)
          },
          onHover: (evt, elements) => {
            const target = evt.native?.target as HTMLElement | undefined
            if (target) target.style.cursor = elements.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { size: 10 }, boxWidth: 22, boxHeight: 4, generateLabels: lineStyleLegendLabels },
            },
            tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y}%` } },
          },
          scales: {
            x: { stacked: false, ticks: { maxRotation: 45, autoSkip: false } },
            y: { stacked: true, beginAtZero: true, max: 100, ticks: { stepSize: 20 } },
          },
        }}
      />
    </div>
  )
}

function StageMatrixTable({
  tableRef,
  matrix,
  sortedGroups,
  sortDir,
  onToggleSort,
  groupKey,
  onViewGroupInCards,
}: {
  tableRef: RefObject<HTMLTableElement | null>
  matrix: ReturnType<typeof computeCompareStageMatrix>
  sortedGroups: { name: string; score: number | null }[]
  sortDir: 'asc' | 'desc'
  onToggleSort: () => void
  groupKey: CompareGroupKey
  onViewGroupInCards: (groupKey: CompareGroupKey, groupValue: string) => void
}) {
  const scoreColor = (score: number | null) => {
    if (score == null) return 'text-neutral-400'
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="w-full min-w-[720px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="px-2 py-2 font-medium">{COMPARE_GROUP_LABEL[groupKey]}</th>
            <th className="cursor-pointer select-none px-2 py-2 font-medium" onClick={onToggleSort} title="Click to sort">
              Score {sortDir === 'desc' ? '↓' : '↑'}
            </th>
            {matrix.stageNames.map((s) => (
              <th key={s} className="px-2 py-2 font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map(({ name, score }) => {
            const meta = matrix.meta[name]
            return (
              <tr key={name} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onViewGroupInCards(groupKey, name)}
                    className="text-left font-semibold text-neutral-700 hover:text-green-700 hover:underline"
                    title="Open this group in Field cards"
                  >
                    {name}
                  </button>
                  {groupKey === 'farmer' && meta && (meta.division || meta.village) && (
                    <div className="text-[10px] text-neutral-400">
                      {[meta.division, meta.village].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td className={`px-2 py-2 font-bold ${scoreColor(score)}`}>{score == null ? '—' : Math.round(score)}</td>
                {matrix.stageNames.map((stageName) => {
                  const cell = matrix.cells[name]?.[stageName]
                  if (!cell || cell.total === 0) {
                    return (
                      <td key={stageName} className="px-2 py-2 text-neutral-300">
                        —
                      </td>
                    )
                  }
                  const goodPct = (cell.goodAc / cell.totalAc) * 100
                  const modPct = (cell.moderateAc / cell.totalAc) * 100
                  const attPct = (cell.attentionAc / cell.totalAc) * 100
                  return (
                    <td key={stageName} className="px-2 py-2">
                      <div className="flex h-2.5 w-24 overflow-hidden rounded-full bg-neutral-100">
                        <div style={{ width: `${goodPct}%`, backgroundColor: HEALTH_COLOR_HEX.good }} />
                        <div style={{ width: `${modPct}%`, backgroundColor: HEALTH_COLOR_HEX.optimal }} />
                        <div style={{ width: `${attPct}%`, backgroundColor: HEALTH_COLOR_HEX.attention }} />
                      </div>
                      <div className="mt-0.5 text-[10px] text-neutral-400">
                        {Math.round(goodPct)}% / {Math.round(modPct)}% / {Math.round(attPct)}%
                      </div>
                      <div className="text-[10px] text-neutral-400">{cell.total} obs</div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
  disabled,
  title,
}: {
  active: boolean
  onClick: () => void
  children: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-green-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
    >
      {children}
    </button>
  )
}
