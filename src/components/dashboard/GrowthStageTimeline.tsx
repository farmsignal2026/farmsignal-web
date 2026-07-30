import { stages, totalGrowthDays } from '../../features/fields/growthStage'
import type { FieldGeo } from '../../features/fields/types'

const STAGE_COLOR: Record<string, string> = {
  good: '#22A65A',
  optimal: '#F59E0B',
  attention: '#DC2626',
  serious: '#7F1D1D',
}
const STAGE_TEXT_COLOR: Record<string, string> = {
  good: '#0D3D17',
  optimal: '#7C4A08',
  attention: '#7A1414',
  serious: '#3D0C0C',
}
const DEFAULT_COLOR = '#D3D1C7'
const DEFAULT_TEXT_COLOR = '#888780'

/** Direct port of the Flutter `GrowthStageTimeline` widget
 * (farmsignal_flutter/lib/features/map/presentation/widgets/growth_stage_timeline.dart),
 * itself a port of `renderStageTimeline()` (000_A_FarmSignal_APP_new.html:
 * 4039-4100) — a segmented bar across the 5 growth stages, a "Day N" marker
 * over the current position, per-stage NDVI value + name labels below. */
export function GrowthStageTimeline({ geo }: { geo: FieldGeo }) {
  const curDay = geo.growthDays ?? 0
  const curFraction = Math.min(1, Math.max(0, curDay / totalGrowthDays))

  const statusAt = (i: number) => (i < geo.stageData.length ? geo.stageData[i].status : 'future')
  const isCurrent = (i: number) => i < geo.stageData.length && geo.stageData[i].current
  const ndviLabelAt = (i: number) => {
    const sd = i < geo.stageData.length ? geo.stageData[i] : undefined
    if (sd?.ndvi != null) return sd.ndvi.toFixed(2)
    return `~${stages[i].expNdvi.toFixed(2)}`
  }

  return (
    <div className="relative pt-6" style={{ height: 68 }}>
      <div
        className="absolute flex flex-col items-center"
        style={{ left: `clamp(0px, calc(${curFraction * 100}% - 18px), calc(100% - 36px))`, top: 0 }}
      >
        <div className="rounded border border-[#27500A] bg-white/90 px-1.5 py-0.5 text-[8px] font-bold text-[#27500A]">
          Day {curDay}
        </div>
        <div className="h-5 w-[1.5px] bg-[#27500A]" />
      </div>

      <div className="absolute left-0 right-0 flex overflow-hidden rounded-lg" style={{ top: 22, height: 18 }}>
        {stages.map((s, i) => (
          <div
            key={s.name}
            style={{
              flex: s.days,
              backgroundColor: STAGE_COLOR[statusAt(i)] ?? DEFAULT_COLOR,
              borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.24)' : undefined,
              boxShadow: isCurrent(i) ? 'inset 0 0 0 1px rgba(255,255,255,0.54)' : undefined,
            }}
          />
        ))}
      </div>

      <div className="absolute left-0 right-0 flex" style={{ top: 43 }}>
        {stages.map((s, i) => (
          <div
            key={s.name}
            className="text-center"
            style={{
              flex: s.days,
              fontSize: 8.5,
              fontWeight: isCurrent(i) ? 800 : 600,
              color: STAGE_TEXT_COLOR[statusAt(i)] ?? DEFAULT_TEXT_COLOR,
            }}
          >
            {ndviLabelAt(i)}
          </div>
        ))}
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex">
        {stages.map((s, i) => (
          <div
            key={s.name}
            className="text-center"
            style={{
              flex: s.days,
              fontSize: 7.5,
              fontWeight: isCurrent(i) ? 700 : 500,
              color: isCurrent(i) ? '#27500A' : '#888780',
            }}
          >
            {s.short}
          </div>
        ))}
      </div>
    </div>
  )
}
