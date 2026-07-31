import type { Chart as ChartInstance } from 'chart.js'
import * as XLSX from 'xlsx'

/** Writes an array of plain row objects to a single-sheet .xlsx and
 * triggers a download — every column value keeps its real type (number,
 * not a quoted string) so the file drops straight into a pivot table
 * without reformatting, unlike source's plain-CSV exports. Column order
 * follows the first row's key order, so callers should build each row
 * object with keys in the order they want columns to appear. */
export function downloadXLSX(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Direct canvas snapshot download — ports source's `exportChartPNG()`
 * (RS_Cane_Monitoring_S1.html:6497-6504). react-chartjs-2 still renders to
 * a real `<canvas>` under the hood, so `chart.canvas.toDataURL()` works
 * identically to source's `document.getElementById(canvasId)` lookup,
 * just via the chart's own ref instead of a DOM id. */
export function downloadChartPNG(chart: ChartInstance | null, filename: string) {
  if (!chart) {
    window.alert('Nothing to export — generate the chart first.')
    return
  }
  const a = document.createElement('a')
  a.href = chart.canvas.toDataURL('image/png')
  a.download = `${filename}_${dateStamp()}.png`
  a.click()
}

const PRINT_STYLE = `body{margin:0;padding:28px;font-family:Arial,sans-serif}
h2{margin:0 0 4px;color:#1a1a1a}p{margin:0 0 18px;color:#888;font-size:12px}
img{max-width:100%}table{border-collapse:collapse;width:100%}
td,th{padding:6px 10px;font-size:12px;border-bottom:1px solid #eee;text-align:left}
@media print{@page{size:landscape}}`

function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open('', '_blank')
  if (!w) {
    window.alert('Popup blocked! Please allow popups for this page.')
    return
  }
  w.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_STYLE}</style></head>` +
      `<body><h2>${title}</h2><p>Exported ${new Date().toLocaleDateString()} from FarmSignal</p>${bodyHtml}</body></html>`,
  )
  w.document.close()
  // Give the image/table a moment to paint before invoking the print
  // dialog — "Save as PDF" is a built-in destination in every browser's
  // print panel, same trick source uses instead of a PDF library.
  setTimeout(() => {
    w.focus()
    w.print()
  }, 350)
}

/** Ports `exportChartPDF()` (:6506-6525) — no PDF library needed. */
export function printChartAsPDF(chart: ChartInstance | null, title: string) {
  if (!chart) {
    window.alert('Nothing to export — generate the chart first.')
    return
  }
  openPrintWindow(title, `<img src="${chart.canvas.toDataURL('image/png')}">`)
}

/** For a plain HTML table (e.g. Compare's Stage Matrix) rather than a
 * canvas — ports `compareExportPDF()`'s table branch (:6842-6857). */
export function printTableAsPDF(title: string, tableEl: HTMLElement | null) {
  if (!tableEl || !tableEl.innerHTML.trim()) {
    window.alert('Nothing to export — generate the table first.')
    return
  }
  openPrintWindow(title, tableEl.outerHTML)
}

/** Dumps a chart's labels/datasets to .xlsx — ports `exportChartExcel()`
 * (:6527-6541). */
export function downloadChartExcel(chart: ChartInstance | null, filename: string) {
  if (!chart?.data) {
    window.alert('Nothing to export — generate the chart first.')
    return
  }
  const labels = chart.data.labels ?? []
  const datasets = chart.data.datasets ?? []
  const rows = labels.map((label, i) => {
    const row: Record<string, unknown> = { Label: label as string }
    for (const ds of datasets) row[String(ds.label ?? '')] = ds.data?.[i] ?? ''
    return row
  })
  downloadXLSX(filename, 'Chart data', rows)
}
