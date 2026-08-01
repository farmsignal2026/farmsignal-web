import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  IMPORT_TEMPLATE_EXAMPLE_ROW,
  IMPORT_TEMPLATE_HEADERS,
  validateImportRows,
  type ImportLookups,
  type ImportRowError,
  type ImportRowInput,
  type ValidatedImportRow,
} from '../../features/fields/import'
import { ImportRepository, type ImportResult } from '../../features/fields/importRepository'
import { supabase } from '../../lib/supabaseClient'

const importRepository = new ImportRepository(supabase)

/** Side-by-side reference columns (Code | Name pairs, or a single value
 * column for free-text fields) — a real Excel data-validation dropdown or
 * red conditional-formatting flag isn't achievable with the free `xlsx`
 * (SheetJS Community) library this app already depends on, cell
 * styling/data-validation writing is a Pro-only feature — so this is the
 * practical alternative: a plain lookup sheet to copy-paste or eyeball
 * against while filling the Fields sheet. Real typo-catching still happens
 * on upload (auto-correct + a visible "new" flag, see import.ts's
 * resolveFreeText), which is strictly more reliable anyway since it checks
 * against live current data, not a static snapshot that can go stale. */
function buildMasterDataSheet(lk: ImportLookups): unknown[][] {
  const blocks: { header: string[]; rows: string[][] }[] = [
    { header: ['Factory Code', 'Factory Name'], rows: lk.masterData.factories.map((f) => [f.code, f.name]) },
    { header: ['Division Code', 'Division Name'], rows: lk.masterData.divisions.map((d) => [d.code, d.name]) },
    { header: ['Section Code', 'Section Name'], rows: lk.masterData.sections.map((s) => [s.code, s.name]) },
    { header: ['Village Code', 'Village Name'], rows: lk.masterData.villages.map((v) => [v.code, v.name]) },
    { header: ['Farmer Code', 'Farmer Name'], rows: lk.masterData.farmers.map((f) => [f.code, f.name]) },
    { header: ['Variety'], rows: lk.masterData.varieties.map((v) => [v]) },
    { header: ['Irrigation Type'], rows: lk.masterData.irrigationTypes.map((v) => [v]) },
    { header: ['Water Source'], rows: lk.masterData.waterSources.map((v) => [v]) },
    { header: ['Soil Type'], rows: lk.masterData.soilTypes.map((v) => [v]) },
    { header: ['Seed Type'], rows: lk.masterData.seedTypes.map((v) => [v]) },
  ]
  const maxRows = Math.max(0, ...blocks.map((b) => b.rows.length))
  const headerRow: string[] = []
  const dataRows: string[][] = Array.from({ length: maxRows }, () => [])
  blocks.forEach((block, i) => {
    headerRow.push(...block.header)
    for (let r = 0; r < maxRows; r++) {
      dataRows[r].push(...(block.rows[r] ?? block.header.map(() => '')))
    }
    if (i < blocks.length - 1) {
      headerRow.push('')
      dataRows.forEach((row) => row.push(''))
    }
  })
  return [headerRow, ...dataRows]
}

interface ImportFieldsModalProps {
  onClose: () => void
  onImported: () => void
}

type Stage = 'intro' | 'reviewing' | 'preview' | 'importing' | 'done'

function cellToString(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** Date cells need their own path, read WITHOUT `cellDates` — SheetJS's
 * serial-number-to-`Date` conversion (cellDates: true) has a real rounding
 * quirk: for a cell storing July 25 2026, it hands back a `Date` object
 * landing ~10 seconds short of local midnight, which reads back as July 24
 * no matter whether you use local or UTC getters (reproduced directly:
 * serial 46228 -> "2026-07-24T18:29:50.000Z", not "...T00:00:00.000Z" or
 * "...-25"). Decoding the raw Excel serial number ourselves via
 * `XLSX.SSF.parse_date_code` is exact — no Date object, no rounding, no
 * timezone involved at all. Falls back to plain text for cells where the
 * user typed the date as text rather than letting Excel auto-format it. */
function cellToDateString(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  return String(v).trim()
}

/** New-field import — download a blank template, fill it in offline
 * (existing plot-numbering convention, existing farmer codes), upload it
 * back for validation + a preview of what will/won't import, then write.
 * Genuinely new functionality, not a port — see import.ts's docstring.
 * Requires two new Supabase INSERT policies (`plots`, `plot_seasons` had
 * SELECT-only policies before this) — same "give the user exact SQL to
 * apply" pattern as the scout_followups/alerts RLS gaps found earlier. */
export function ImportFieldsModal({ onClose, onImported }: ImportFieldsModalProps) {
  const [stage, setStage] = useState<Stage>('intro')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lookups, setLookups] = useState<ImportLookups | null>(null)
  const [validRows, setValidRows] = useState<ValidatedImportRow[]>([])
  const [invalidRows, setInvalidRows] = useState<ImportRowError[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    importRepository
      .loadLookups()
      .then(setLookups)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const fieldsRow: Record<string, unknown> = {}
    IMPORT_TEMPLATE_HEADERS.forEach((h, i) => {
      fieldsRow[h] = IMPORT_TEMPLATE_EXAMPLE_ROW[i]
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([fieldsRow]), 'Fields')
    if (lookups) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildMasterDataSheet(lookups)), 'Master Data')
    }
    XLSX.writeFile(wb, `field_import_template_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function handleFile(file: File) {
    setStage('reviewing')
    setLoadError(null)
    try {
      const buf = await file.arrayBuffer()
      // cellDates deliberately omitted (defaults to false) — date cells
      // are decoded manually via cellToDateString, see its docstring.
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][]
      if (aoa.length < 2) throw new Error('The file has no data rows.')

      const headerRow = aoa[0].map((h) => cellToString(h).toLowerCase())
      const colIndex = (label: string) => headerRow.indexOf(label.toLowerCase())
      const idx = {
        plotNo: colIndex(IMPORT_TEMPLATE_HEADERS[0]),
        clientCode: colIndex(IMPORT_TEMPLATE_HEADERS[1]),
        factoryCode: colIndex(IMPORT_TEMPLATE_HEADERS[2]),
        divisionCode: colIndex(IMPORT_TEMPLATE_HEADERS[3]),
        sectionCode: colIndex(IMPORT_TEMPLATE_HEADERS[4]),
        villageCode: colIndex(IMPORT_TEMPLATE_HEADERS[5]),
        farmerCode: colIndex(IMPORT_TEMPLATE_HEADERS[6]),
        farmerName: colIndex(IMPORT_TEMPLATE_HEADERS[7]),
        farmerPhone: colIndex(IMPORT_TEMPLATE_HEADERS[8]),
        plantingDate: colIndex(IMPORT_TEMPLATE_HEADERS[9]),
        plantingSeason: colIndex(IMPORT_TEMPLATE_HEADERS[10]),
        crushingSeason: colIndex(IMPORT_TEMPLATE_HEADERS[11]),
        plotType: colIndex(IMPORT_TEMPLATE_HEADERS[12]),
        cropType: colIndex(IMPORT_TEMPLATE_HEADERS[13]),
        variety: colIndex(IMPORT_TEMPLATE_HEADERS[14]),
        irrigationType: colIndex(IMPORT_TEMPLATE_HEADERS[15]),
        waterSource: colIndex(IMPORT_TEMPLATE_HEADERS[16]),
        soilType: colIndex(IMPORT_TEMPLATE_HEADERS[17]),
        seedType: colIndex(IMPORT_TEMPLATE_HEADERS[18]),
        spacingFeet: colIndex(IMPORT_TEMPLATE_HEADERS[19]),
        areaAcres: colIndex(IMPORT_TEMPLATE_HEADERS[20]),
      }
      const missing = Object.entries(idx).filter(([, v]) => v === -1)
      if (missing.length > 0) {
        throw new Error(
          `Missing column(s): ${missing.map(([k]) => k).join(', ')}. Use the downloaded template's exact headers — don't rename or reorder them.`,
        )
      }

      const dataRows = aoa.slice(1).filter((r) => r.some((cell) => cellToString(cell) !== ''))
      const inputRows: ImportRowInput[] = dataRows.map((r) => ({
        plotNo: cellToString(r[idx.plotNo]),
        clientCode: cellToString(r[idx.clientCode]),
        factoryCode: cellToString(r[idx.factoryCode]),
        divisionCode: cellToString(r[idx.divisionCode]),
        sectionCode: cellToString(r[idx.sectionCode]),
        villageCode: cellToString(r[idx.villageCode]),
        farmerCode: cellToString(r[idx.farmerCode]),
        farmerName: cellToString(r[idx.farmerName]),
        farmerPhone: cellToString(r[idx.farmerPhone]),
        plantingDate: cellToDateString(r[idx.plantingDate]),
        plantingSeason: cellToString(r[idx.plantingSeason]),
        crushingSeason: cellToString(r[idx.crushingSeason]),
        plotType: cellToString(r[idx.plotType]),
        cropType: cellToString(r[idx.cropType]),
        variety: cellToString(r[idx.variety]),
        irrigationType: cellToString(r[idx.irrigationType]),
        waterSource: cellToString(r[idx.waterSource]),
        soilType: cellToString(r[idx.soilType]),
        seedType: cellToString(r[idx.seedType]),
        spacingFeet: cellToString(r[idx.spacingFeet]),
        areaAcres: cellToString(r[idx.areaAcres]),
      }))

      const lk = lookups ?? (await importRepository.loadLookups())
      setLookups(lk)
      const { valid, invalid } = validateImportRows(inputRows, lk)
      setValidRows(valid)
      setInvalidRows(invalid)
      setStage('preview')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      setStage('intro')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImport() {
    setStage('importing')
    const res = await importRepository.importFields(validRows)
    setResult(res)
    setStage('done')
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div className="text-sm font-bold text-neutral-800">➕ Import new fields</div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4 text-sm" style={{ maxHeight: 'calc(88vh - 130px)' }}>
          {stage === 'intro' && (
            <>
              <p className="text-xs text-neutral-500">
                Download the template, fill in one row per new plot (delete the example row), then upload it back.
                Plot No must be new; Factory/Division/Section/Village Code must already exist. Farmer Code can be an
                existing farmer, or a new one — if the code isn't found, a new farmer is created from the Farmer
                Name/Phone columns. GPS boundary and officer assignment are separate steps, done afterward.
              </p>
              <p className="text-xs text-neutral-500">
                The template includes a <b>Master Data</b> sheet listing every real Factory/Division/Section/
                Village/Farmer code and existing Variety/Irrigation/Water/Soil/Seed values, to copy from instead of
                retyping. On upload, anything that's a near-match to an existing value (e.g. "co86032" vs "Co
                86032") is auto-corrected to match; a genuinely new value is flagged for a second look rather than
                silently accepted.
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={!lookups}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                {lookups ? '⬇ Download template' : 'Loading master data…'}
              </button>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  Upload filled template
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </div>
              {loadError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</div>
              )}
            </>
          )}

          {stage === 'reviewing' && (
            <div className="py-8 text-center text-xs text-neutral-400">Reading and validating file…</div>
          )}

          {stage === 'preview' && (
            <>
              <div className="flex gap-3 text-xs">
                <div className="rounded-md bg-green-50 px-3 py-2 font-semibold text-green-700">
                  {validRows.length} row{validRows.length !== 1 ? 's' : ''} ready to import
                </div>
                {invalidRows.length > 0 && (
                  <div className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-700">
                    {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors — will be skipped
                  </div>
                )}
              </div>

              {invalidRows.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border border-neutral-200">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-neutral-50">
                      <tr>
                        <th className="px-2 py-1 font-medium text-neutral-500">Row</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Plot No</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.map((r) => (
                        <tr key={r.rowNumber} className="border-t border-neutral-100">
                          <td className="px-2 py-1 text-neutral-500">{r.rowNumber}</td>
                          <td className="px-2 py-1 text-neutral-700">{r.plotNo}</td>
                          <td className="px-2 py-1 text-red-600">{r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {validRows.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border border-neutral-200">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-neutral-50">
                      <tr>
                        <th className="px-2 py-1 font-medium text-neutral-500">Plot No</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Factory</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Farmer</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Planted</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Type</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Variety</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Acres</th>
                        <th className="px-2 py-1 font-medium text-neutral-500">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((r) => (
                        <tr key={r.plotNo} className="border-t border-neutral-100">
                          <td className="px-2 py-1 font-medium text-neutral-700">{r.plotNo}</td>
                          <td className="px-2 py-1 text-neutral-600">{r.factoryCode}</td>
                          <td className="px-2 py-1 text-neutral-600">
                            {r.farmerCode}
                            {r.newFarmerName && (
                              <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                                new: {r.newFarmerName}
                              </span>
                            )}
                            {r.existingFarmerName !== null && (
                              <span
                                className="ml-1 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700"
                                title="This code already belongs to an existing farmer — that farmer will be linked, not a new one"
                              >
                                existing: {r.existingFarmerName || '(no name on file)'}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-neutral-600">{r.plantingDate}</td>
                          <td className="px-2 py-1 text-neutral-600">{r.plotType}</td>
                          <td className="px-2 py-1 text-neutral-600">
                            {r.variety}
                            {r.varietyAutoFormattedFrom && (
                              <span
                                className="ml-1 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700"
                                title="Auto-corrected to the standard Co #### spacing"
                              >
                                was: {r.varietyAutoFormattedFrom}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-neutral-600">{r.areaAcres}</td>
                          <td className="px-2 py-1">
                            {r.newFreeTextFields.map((f) => (
                              <span
                                key={f.field}
                                className="mr-1 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700"
                                title="No existing match found — double-check this isn't a typo of an existing value"
                              >
                                new {f.field}: {f.value}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {stage === 'importing' && (
            <div className="py-8 text-center text-xs text-neutral-400">
              Importing {validRows.length} field{validRows.length !== 1 ? 's' : ''}…
            </div>
          )}

          {stage === 'done' && result && (
            <div className="space-y-2">
              <div className="rounded-md bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                {result.okCount} field{result.okCount !== 1 ? 's' : ''} created
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  <div className="font-semibold">{result.failed.length} failed:</div>
                  <ul className="mt-1 list-disc pl-4">
                    {result.failed.map((f) => (
                      <li key={f.plotNo}>
                        {f.plotNo}: {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          {stage === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStage('intro')}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                Choose different file
              </button>
              <button
                type="button"
                disabled={validRows.length === 0}
                onClick={handleImport}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
              >
                Import {validRows.length} field{validRows.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {stage === 'done' && (
            <button
              type="button"
              onClick={onImported}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              Done
            </button>
          )}
          {(stage === 'intro' || stage === 'reviewing') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
