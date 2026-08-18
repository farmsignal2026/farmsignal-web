import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { downloadBlob } from '../../lib/exportUtils'
import type { ExecutiveReportData } from './executiveReport'

const HEADER_SHADE = 'DCFCE7'
// Full content width for a standard A4 page with docx's default 1" margins
// (11906 twips page width - 2×1440 twips margin). Deliberately NOT
// `WidthType.PERCENTAGE` — this version of the `docx` package serializes a
// percentage table width as the literal string `w:w="100%"`, which fails
// Word's strict OOXML schema validation (it expects an integer, fiftieths
// of a percent, e.g. "5000") and made every downloaded report unopenable
// ("cannot be opened because there are problems with the contents").
// Explicit DXA (twips) sidesteps that bug entirely.
const FULL_WIDTH_DXA = 9026

function cell(text: string, opts: { bold?: boolean; shade?: string } = {}): TableCell {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
  })
}

function headerRow(headers: string[]): TableRow {
  return new TableRow({ children: headers.map((h) => cell(h, { bold: true, shade: HEADER_SHADE })) })
}

function dataRow(values: (string | number)[]): TableRow {
  return new TableRow({ children: values.map((v) => cell(String(v))) })
}

function simpleTable(headers: string[], rows: (string | number)[][]): Table {
  return new Table({
    width: { size: FULL_WIDTH_DXA, type: WidthType.DXA },
    rows: [headerRow(headers), ...rows.map(dataRow)],
  })
}

function heading2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, text })
}

function bodyText(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 160 }, children: [new TextRun(text)] })
}

/** Builds and downloads the Executive Report as an editable .docx — user's
 * explicit request ("I might need to edit some points"), so a real Word
 * document rather than a print-to-PDF snapshot. Mirrors the on-screen
 * section order in `ExecutiveReportView.tsx` exactly, so the downloaded
 * file and the live page never drift apart in structure.
 *
 * Deliberately does NOT embed the health-trend chart as an image. An
 * earlier version did (via `ImageRun`, fed the chart's own
 * `canvas.toDataURL()`), but the installed `docx` package (v9.7.1) emits
 * an invalid `pic:cNvPr id="0"` in the DrawingML it generates for images —
 * Word's strict OOXML validator rejects that (drawing-object ids are
 * expected to start at 1), and there's no public option on `ImageRun` to
 * override it. That's a second, independent corruption bug from the first
 * one this export already hit (percentage table widths, fixed above) —
 * rather than risk a third undiscovered DrawingML issue, the chart image
 * is left out entirely; the chart is already visible on the report page
 * itself, and every other section (text, all tables) is unaffected. */
export async function downloadExecutiveReportDocx(report: ExecutiveReportData) {
  const children: (Paragraph | Table)[] = []

  children.push(
    new Paragraph({ heading: HeadingLevel.TITLE, text: report.factory }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Executive Report — ${report.periodLabel} · ${report.totalFields} fields · ${report.totalAcres.toFixed(0)} acres`,
          color: '6B7280',
        }),
      ],
    }),
  )

  children.push(heading2('Summary'), bodyText(report.summary))

  children.push(heading2('Comparison with previous Fortnight'), bodyText(report.comparison.narrative))
  if (report.comparison.comparable && report.comparison.divisionMovers.length > 0) {
    children.push(
      simpleTable(
        ['Division', 'Score change vs. previous fortnight'],
        report.comparison.divisionMovers.map((m) => [m.division, m.delta >= 0 ? `+${m.delta}` : `${m.delta}`]),
      ),
    )
  }

  children.push(
    heading2('Crop Health (acres)'),
    simpleTable(
      ['Status', 'Fields', 'Acres'],
      [
        ['Good', report.good.count, report.good.acres.toFixed(1)],
        ['Moderate', report.moderate.count, report.moderate.acres.toFixed(1)],
        ['Need Attention', report.attention.count, report.attention.acres.toFixed(1)],
      ],
    ),
  )

  children.push(
    heading2('Scout Status'),
    simpleTable(
      ['Unattended', 'Scouted', 'Overdue', 'Closed', 'Watch Worst'],
      [[
        report.scoutStatusCounts.Unattended,
        report.scoutStatusCounts.Scouted,
        report.scoutStatusCounts.Overdue,
        report.scoutStatusCounts.Closed,
        report.scoutStatusCounts['Watch Worst'],
      ]],
    ),
  )

  children.push(
    heading2('Top Reasons'),
    report.topReasons.length > 0
      ? simpleTable(
          ['Reason', 'Count'],
          report.topReasons.map((r) => [r.category, r.count]),
        )
      : bodyText('No flagged scout checklist reasons in this period.'),
  )

  children.push(
    heading2('Division Ranking'),
    simpleTable(
      ['Division', 'Score', 'Fields', 'Acres', 'Good %', 'Moderate %', 'Attention %', 'Unattended', 'Overdue', 'Closed'],
      report.divisionRanking.map((d) => [
        d.division,
        d.avgScore.toFixed(0),
        d.fieldCount,
        d.acres.toFixed(0),
        `${d.goodPct}%`,
        `${d.moderatePct}%`,
        `${d.attentionPct}%`,
        d.unattended,
        d.overdue,
        d.closed,
      ]),
    ),
  )

  const plotColumns = ['Plot', 'Farmer', 'Division', 'Village', 'Crop Type', 'Stage', 'Score']
  const plotRow = (p: ExecutiveReportData['topPlots'][number]) => [
    p.field.code,
    p.field.name,
    p.field.division,
    p.field.village,
    p.field.type,
    p.stageName,
    p.score,
  ]

  children.push(
    heading2('Top 10 Performing Plots'),
    report.topPlots.length > 0 ? simpleTable(plotColumns, report.topPlots.map(plotRow)) : bodyText('No scored plots.'),
  )
  children.push(
    heading2('Bottom 10 Performing Plots'),
    report.bottomPlots.length > 0
      ? simpleTable(plotColumns, report.bottomPlots.map(plotRow))
      : bodyText('No scored plots.'),
  )

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const stamp = report.generatedOn.toISOString().slice(0, 10)
  downloadBlob(blob, `ExecutiveReport_${report.factory.replace(/\s+/g, '_')}_${stamp}.docx`)
}
