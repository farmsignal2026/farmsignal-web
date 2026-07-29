export type TabKey =
  | 'trend'
  | 'compare'
  | 'scoutAnalytics'
  | 'summary'
  | 'cards'
  | 'table'
  | 'chart'
  | 'map'
  | 'insights'

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'trend', label: '📊 Health Trend' },
  { key: 'compare', label: '⚖️ Compare' },
  { key: 'scoutAnalytics', label: '🔍 Scout Analytics' },
  { key: 'summary', label: '📈 Stage summary' },
  { key: 'cards', label: '🗂 Field cards' },
  { key: 'table', label: '📋 Table' },
  { key: 'chart', label: 'NDVI Trend' },
  { key: 'map', label: '🗺️ Field Map' },
  { key: 'insights', label: '🔬 AI Insights' },
]

interface TabBarProps {
  active: TabKey
  onSelect: (key: TabKey) => void
}

/** Ports the tab strip (RS_Cane_Monitoring_S1.html:859-868). Each tab body
 * is an empty placeholder for now — wired up for real in Phases 2-5. */
export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`rounded-t-md px-3 py-2 text-sm font-medium transition ${
            active === tab.key
              ? 'border-b-2 border-green-600 text-green-700'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ tab }: { tab: TabKey }) {
  const label = TABS.find((t) => t.key === tab)?.label ?? tab
  return (
    <div className="flex min-h-[300px] items-center justify-center rounded-b-md border border-t-0 border-neutral-200 bg-white text-sm text-neutral-400">
      {label} — coming soon
    </div>
  )
}
