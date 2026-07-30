import type { Plugin } from 'chart.js'
import { stageBandColor } from '../features/fields/badgeStyles'
import type { GrowthStage } from '../features/fields/growthStage'

export interface StageBand {
  name: string
  dayMin: number
  dayMax: number
  fill: string
  text: string
}

interface StageBandsOptions {
  bands: StageBand[]
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType> {
    stageBands?: StageBandsOptions
  }
}

/** Builds the band list for a set of stages actually present in a chart's
 * data (dayMin/dayMax per stage, contiguous from 0) — shared by
 * NdviTrendView and NdviTrendModal so both charts stay visually identical. */
export function buildStageBands(activeStages: GrowthStage[]): StageBand[] {
  return activeStages.map((s, i) => {
    const dayMin = i === 0 ? 0 : activeStages[i - 1].cumEnd
    const { fill, text } = stageBandColor(s.name)
    return { name: s.name, dayMin, dayMax: s.cumEnd, fill, text }
  })
}

/** Draws colored, labeled growth-stage bands along the bottom of an NDVI
 * chart's plot area (RS_Cane_Monitoring_S1.html-style stage identification
 * strip) — real pixel alignment via the chart's own x-scale, not an
 * approximated HTML overlay. Opt-in per chart via
 * `plugins={[stageBandsPlugin]}` + `options.plugins.stageBands`. */
export const stageBandsPlugin: Plugin<'line'> = {
  id: 'stageBands',
  afterDatasetsDraw(chart) {
    const opts = (chart.options.plugins as { stageBands?: StageBandsOptions } | undefined)?.stageBands
    if (!opts?.bands.length) return
    const xScale = chart.scales.x
    if (!xScale) return

    const { ctx, chartArea } = chart
    const bandHeight = 16
    const top = chartArea.bottom - bandHeight

    ctx.save()
    ctx.beginPath()
    ctx.rect(chartArea.left, top, chartArea.right - chartArea.left, bandHeight)
    ctx.clip()

    for (const band of opts.bands) {
      const x0 = Math.max(chartArea.left, xScale.getPixelForValue(band.dayMin))
      const x1 = Math.min(chartArea.right, xScale.getPixelForValue(band.dayMax))
      if (x1 <= x0) continue

      ctx.fillStyle = band.fill
      ctx.fillRect(x0, top, x1 - x0, bandHeight)

      if (x1 - x0 > 36) {
        ctx.fillStyle = band.text
        ctx.font = '9px DM Sans, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(band.name, (x0 + x1) / 2, top + bandHeight / 2, x1 - x0 - 4)
      }
    }
    ctx.restore()
  },
}
