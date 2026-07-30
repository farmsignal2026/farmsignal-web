import type { Chart } from 'chart.js'

/** Shared Chart.js legend `generateLabels`: thick colored line swatches
 * (matching the chart's own line style, not Chart.js's default filled
 * box) and excludes internal `_t_`-prefixed datasets — the threshold/
 * stage-band helper lines (see stageBandsPlugin.ts and the `thresholdDatasets`
 * built alongside NDVI charts) were leaking into the legend as visible
 * "_t_Germination" etc. entries since no chart here had previously
 * disabled or filtered Chart.js's default legend. */
export function lineStyleLegendLabels(chart: Chart) {
  return (chart.data.datasets ?? [])
    .map((ds, i) => ({ ds, i }))
    .filter(({ ds }) => !String(ds.label ?? '').startsWith('_t_'))
    .map(({ ds, i }) => ({
      text: String(ds.label ?? ''),
      fillStyle: (ds.borderColor as string) ?? (ds.backgroundColor as string),
      strokeStyle: (ds.borderColor as string) ?? (ds.backgroundColor as string),
      lineWidth: 0,
      hidden: !chart.isDatasetVisible(i),
      datasetIndex: i,
    }))
}
