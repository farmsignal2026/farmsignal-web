import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { computeExecutiveReport, factoriesIn } from '../../features/fields/executiveReport'
import { downloadExecutiveReportDocx } from '../../features/fields/executiveReportExport'
import type { PlotScore } from '../../features/fields/aiInsights'
import type { Field, FieldGeo } from '../../features/fields/types'
import { useStageResolver } from '../../features/fields/useFieldsData'
import type { ScoutData } from '../../features/scout/types'

interface ExecutiveReportViewProps {
  fields: Field[]
  geoByCode: Record<string, FieldGeo>
  scoutData: ScoutData
  onViewPlotsInCards: (plotCodes: string[]) => void
}

const TREND_WINDOW_DAYS = 180

/** One-page-per-factory snapshot for management review, meant to be
 * regenerated each fortnight (the health-trend graph already samples on
 * that cadence — see `computeHealthTrend`'s `genDatePoints`). First pass:
 * combines Health Trend / Scout Analytics / AI Insights' plot-scoring
 * computations into one page rather than a new dedicated data model, so any
 * fix to those stays automatically reflected here too. Not yet wired to
 * export/print — this is the "show me a template first" prototype pass. */
export function ExecutiveReportView({ fields, geoByCode, scoutData, onViewPlotsInCards }: ExecutiveReportViewProps) {
  const factories = useMemo(() => factoriesIn(fields), [fields])
  const [selectedFactory, setSelectedFactory] = useState(factories[0] ?? '')
  const factory = factories.includes(selectedFactory) ? selectedFactory : factories[0]
  const [downloading, setDownloading] = useState(false)
  const stageResolver = useStageResolver()

  const { trendStart, trendEnd } = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - TREND_WINDOW_DAYS * 86400000)
    return { trendStart: start, trendEnd: end }
  }, [])

  const report = useMemo(() => {
    if (!factory) return null
    return computeExecutiveReport(factory, fields, geoByCode, scoutData, trendStart, trendEnd, stageResolver)
  }, [factory, fields, geoByCode, scoutData, trendStart, trendEnd, stageResolver])

  if (factories.length === 0) {
    return <div className="p-6 text-center text-sm text-neutral-400">No factories in the current filter scope.</div>
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="mr-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Factory / Mill</label>
          <select
            data-testid="exec-report-factory-select"
            value={factory}
            onChange={(e) => setSelectedFactory(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700"
          >
            {factories.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        {report && (
          <div className="flex items-center gap-3">
            <div className="text-right text-[11px] text-neutral-400">
              {report.periodLabel}
              <br />
              Generated {report.generatedOn.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadExecutiveReportDocx(report)
                } finally {
                  setDownloading(false)
                }
              }}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {downloading ? 'Preparing…' : '⬇ Download .docx'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              title="Opens the browser print dialog — choose 'Save as PDF' as the destination"
            >
              🖨️ Print / Save as PDF
            </button>
          </div>
        )}
      </div>

      {report && (
        <div className="print-area space-y-5">
          <ReportHeader report={report} />
          <SummarySection text={report.summary} />
          <ComparisonSection comparison={report.comparison} />
          <KpiRow report={report} />
          <HealthTrendChart report={report} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ScoutStatusCard report={report} />
            <TopReasonsCard report={report} />
          </div>
          <DivisionRankingTable report={report} onViewPlotsInCards={onViewPlotsInCards} fields={fields} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlotRankingTable title="Top 10 Performing Plots" plots={report.topPlots} tone="good" onViewPlotsInCards={onViewPlotsInCards} />
            <PlotRankingTable title="Bottom 10 Performing Plots" plots={report.bottomPlots} tone="attention" onViewPlotsInCards={onViewPlotsInCards} />
          </div>
        </div>
      )}
    </div>
  )
}

function ReportHeader({ report }: { report: ReturnType<typeof computeExecutiveReport> }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-gradient-to-r from-green-50 to-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Executive Report</div>
      <div className="text-xl font-bold text-neutral-800">{report.factory}</div>
      <div className="text-xs text-neutral-500">
        {report.totalFields} fields · {report.totalAcres.toFixed(0)} acres
      </div>
    </div>
  )
}

function SummarySection({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Summary</div>
      <p data-report-summary className="text-sm leading-relaxed text-neutral-700">{text}</p>
    </div>
  )
}

function DeltaPill({ label, delta }: { label: string; delta: number }) {
  const color = delta > 0 ? '#22a65a' : delta < 0 ? '#dc2626' : '#6b7280'
  return (
    <div className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-center">
      <div className="text-sm font-bold" style={{ color }}>
        {delta > 0 ? '+' : ''}
        {delta} pt{Math.abs(delta) === 1 ? '' : 's'}
      </div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  )
}

function ComparisonSection({ comparison }: { comparison: ReturnType<typeof computeExecutiveReport>['comparison'] }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Comparison with previous Fortnight
      </div>
      <p className="mb-3 text-sm leading-relaxed text-neutral-700">{comparison.narrative}</p>
      {comparison.comparable && (
        <div className="grid grid-cols-3 gap-2">
          <DeltaPill label="Good" delta={comparison.goodPctDelta} />
          <DeltaPill label="Moderate" delta={comparison.moderatePctDelta} />
          <DeltaPill label="Need Attention" delta={comparison.attentionPctDelta} />
        </div>
      )}
    </div>
  )
}

function KpiRow({ report }: { report: ReturnType<typeof computeExecutiveReport> }) {
  const tiles = [
    { label: 'Good', color: '#22a65a', count: report.good.count, acres: report.good.acres },
    { label: 'Moderate', color: '#f59e0b', count: report.moderate.count, acres: report.moderate.acres },
    { label: 'Need Attention', color: '#dc2626', count: report.attention.count, acres: report.attention.acres },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-neutral-100 bg-white p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: t.color }}>
            {t.count}
          </div>
          <div className="text-xs font-semibold text-neutral-600">{t.label}</div>
          <div className="text-[11px] text-neutral-400">{t.acres.toFixed(0)} ac</div>
        </div>
      ))}
    </div>
  )
}

function HealthTrendChart({ report }: { report: ReturnType<typeof computeExecutiveReport> }) {
  const { labels, series } = report.healthTrend
  if (labels.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400">
        Not enough dated observations in this window to plot a health trend.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Health Trend (Fortnightly)
      </div>
      <div style={{ height: 260 }}>
        <Line
          data={{
            labels,
            datasets: series.map((s) => ({
              label: s.label,
              data: s.counts,
              borderColor: s.color,
              backgroundColor: `${s.color}25`,
              tension: 0.3,
              pointRadius: 3,
              borderWidth: 2,
            })),
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          }}
        />
      </div>
    </div>
  )
}

const SCOUT_STATUS_META: { key: 'Unattended' | 'Scouted' | 'Overdue' | 'Closed' | 'Watch Worst'; color: string }[] = [
  { key: 'Unattended', color: '#dc2626' },
  { key: 'Scouted', color: '#86efac' },
  { key: 'Overdue', color: '#f07c2a' },
  { key: 'Closed', color: '#166534' },
  { key: 'Watch Worst', color: '#b45309' },
]

function ScoutStatusCard({ report }: { report: ReturnType<typeof computeExecutiveReport> }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Scout Status</div>
      <div className="grid grid-cols-5 gap-2">
        {SCOUT_STATUS_META.map((s) => (
          <div key={s.key} className="rounded-md bg-neutral-50 px-2 py-2 text-center">
            <div className="text-lg font-bold" style={{ color: s.color }}>
              {report.scoutStatusCounts[s.key]}
            </div>
            <div className="text-[10px] text-neutral-500">{s.key}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopReasonsCard({ report }: { report: ReturnType<typeof computeExecutiveReport> }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Top Reasons</div>
      {report.topReasons.length === 0 ? (
        <div className="text-sm text-neutral-400">No flagged scout checklist reasons in this period.</div>
      ) : (
        <div className="space-y-1.5">
          {report.topReasons.map((r) => (
            <div key={r.category} className="flex items-center justify-between text-sm">
              <span className="text-neutral-700">{r.category}</span>
              <span className="font-semibold text-neutral-800">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DivisionRankingTable({
  report,
  fields,
  onViewPlotsInCards,
}: {
  report: ReturnType<typeof computeExecutiveReport>
  fields: Field[]
  onViewPlotsInCards: (plotCodes: string[]) => void
}) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Division Ranking</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-[11px] uppercase tracking-wide text-neutral-400">
              <th className="py-1.5 pr-3">Division</th>
              <th className="py-1.5 pr-3">Score</th>
              <th className="py-1.5 pr-3">Fields</th>
              <th className="py-1.5 pr-3">Acres</th>
              <th className="py-1.5 pr-3">Good</th>
              <th className="py-1.5 pr-3">Moderate</th>
              <th className="py-1.5 pr-3">Attention</th>
              <th className="py-1.5 pr-3">Unattended</th>
              <th className="py-1.5 pr-3">Overdue</th>
              <th className="py-1.5 pr-3">Closed</th>
            </tr>
          </thead>
          <tbody>
            {report.divisionRanking.map((d, i) => (
              <tr
                key={d.division}
                className="cursor-pointer border-b border-neutral-50 hover:bg-neutral-50"
                onClick={() =>
                  onViewPlotsInCards(fields.filter((f) => f.factory === report.factory && f.division === d.division).map((f) => f.code))
                }
              >
                <td className="py-1.5 pr-3 font-medium text-neutral-800">
                  {i === 0 ? '🥇 ' : i === report.divisionRanking.length - 1 ? '🔻 ' : ''}
                  {d.division}
                </td>
                <td className="py-1.5 pr-3 font-semibold text-neutral-700">{d.avgScore.toFixed(0)}</td>
                <td className="py-1.5 pr-3 text-neutral-600">{d.fieldCount}</td>
                <td className="py-1.5 pr-3 text-neutral-600">{d.acres.toFixed(0)}</td>
                <td className="py-1.5 pr-3 text-green-600">{d.goodPct}%</td>
                <td className="py-1.5 pr-3 text-amber-600">{d.moderatePct}%</td>
                <td className="py-1.5 pr-3 text-red-600">{d.attentionPct}%</td>
                <td className="py-1.5 pr-3 text-red-600">{d.unattended}</td>
                <td className="py-1.5 pr-3 text-orange-600">{d.overdue}</td>
                <td className="py-1.5 pr-3 text-green-700">{d.closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlotRankingTable({
  title,
  plots,
  tone,
  onViewPlotsInCards,
}: {
  title: string
  plots: PlotScore[]
  tone: 'good' | 'attention'
  onViewPlotsInCards: (plotCodes: string[]) => void
}) {
  const color = tone === 'good' ? '#22a65a' : '#dc2626'
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
        {plots.length > 0 && (
          <button
            type="button"
            onClick={() => onViewPlotsInCards(plots.map((p) => p.field.code))}
            className="text-[11px] font-semibold text-green-700 hover:underline"
          >
            View all in Field Cards
          </button>
        )}
      </div>
      {plots.length === 0 ? (
        <div className="text-sm text-neutral-400">No scored plots in this factory.</div>
      ) : (
        <div className="space-y-1">
          {plots.map((p) => (
            <div key={p.field.code} className="flex items-center justify-between border-b border-neutral-50 py-1.5 text-sm last:border-0">
              <div>
                <div className="font-medium text-neutral-800">
                  {p.field.code}
                  <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                    {p.field.type}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  {p.field.name} · {p.field.division} · {p.field.village} · {p.stageName}
                </div>
              </div>
              <div className="text-base font-bold" style={{ color }}>
                {p.score}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
