import { PLOTTYPE_ORDER } from './plotTypeStyle'

/** New-field import — genuinely new functionality (not a port; source's own
 * upload path was a pre-Supabase legacy mode). Built directly from RSCL's
 * own real master template (RSCL_MasterSupabase130726.xlsx, "New data"
 * tab) rather than an invented column set — that file revealed the real
 * agronomic columns RSCL already tracks (irrigation/water/soil/seed/
 * spacing/planting+crushing season) and the real `crop_type` values
 * (BULK/PNUR/CNUR — an operational classifier, NOT the crop species; this
 * whole platform is sugarcane-only, so "crop" itself is never a field).
 *
 * Scope, deliberately narrow per user direction (season rollover for
 * EXISTING plots — renew/harvest_only — is a separate, later feature, not
 * this one): one row = one brand new plot. Creates a `plots` row (location)
 * + a `plot_seasons` row (current crop-cycle) + optionally a new `farmers`
 * row if Farmer Code doesn't already exist (Farmer Name required in that
 * case). GPS boundary survey and officer assignment stay separate,
 * existing flows — a new plot always starts `is_mapped: false`. */

export const CROP_TYPE_VALUES = ['BULK', 'PNUR', 'CNUR'] as const

export const IMPORT_TEMPLATE_HEADERS = [
  'Plot No',
  'Client Code',
  'Factory Code',
  'Division Code',
  'Section Code',
  'Village Code',
  'Farmer Code',
  'Farmer Name (required only if Farmer Code is new)',
  'Farmer Phone (optional)',
  'Planting Date (YYYY-MM-DD)',
  'Planting Season',
  'Crushing Season',
  `Plot Type (${PLOTTYPE_ORDER.join('/')})`,
  `Crop Type (${CROP_TYPE_VALUES.join('/')})`,
  'Variety',
  'Irrigation Type',
  'Water Source',
  'Soil Type',
  'Seed Type',
  'Spacing (Feet)',
  'Area (Acres)',
] as const

export const IMPORT_TEMPLATE_EXAMPLE_ROW = [
  'EXAMPLE-PLOT-001',
  'RSCL',
  'FAC01',
  'FAC01-DIV1',
  'FAC01-DIV1-SEC1',
  'FAC01-DIV1-SEC1-VIL1',
  'FARMER0001',
  '',
  '',
  '2026-06-15',
  '2025-26',
  '2026-27',
  'PL',
  'BULK',
  'Co 86032',
  'FURROW',
  'BOREWELL',
  'CLAY LOAM',
  'DOUBLE BUD SETTS',
  '4.0 FEET',
  '2.5',
]

/** One row exactly as read off the uploaded sheet, before validation —
 * every field a raw string (or '' if the cell was empty/missing). */
export interface ImportRowInput {
  plotNo: string
  clientCode: string
  factoryCode: string
  divisionCode: string
  sectionCode: string
  villageCode: string
  farmerCode: string
  farmerName: string
  farmerPhone: string
  plantingDate: string
  plantingSeason: string
  crushingSeason: string
  plotType: string
  cropType: string
  variety: string
  irrigationType: string
  waterSource: string
  soilType: string
  seedType: string
  spacingFeet: string
  areaAcres: string
}

export interface ImportLookups {
  factoryCodes: Set<string>
  divisionCodes: Set<string>
  sectionCodes: Set<string>
  villageCodes: Set<string>
  clientCodeByFactory: Map<string, string | null>
  farmerIdByCode: Map<string, string>
  farmerNameByCode: Map<string, string>
  existingPlotNos: Set<string>
  /** One spelling-key map per free-text field prone to the same typo
   * pattern a user flagged live ("instead of Co 86032, they type co 86032
   * or Co86032... it can happen to many column") — Variety, Irrigation
   * Type, Water Source, Soil Type, Seed Type are all open-ended text with
   * real historical values to match against (Plot Type/Crop Type are
   * already hard-validated fixed enums, immune to this). Each maps
   * normalizeFreeTextKey(realSpelling) -> the one canonical spelling
   * already on record. */
  freeTextBySpellingKey: {
    variety: Map<string, string>
    irrigationType: Map<string, string>
    waterSource: Map<string, string>
    soilType: Map<string, string>
    seedType: Map<string, string>
  }
  /** Raw {code,name} lists / value lists for the template's "Master Data"
   * reference sheet — same data the Sets/Maps above are built from, just
   * kept in display form too rather than re-querying. */
  masterData: {
    factories: { code: string; name: string }[]
    divisions: { code: string; name: string }[]
    sections: { code: string; name: string }[]
    villages: { code: string; name: string }[]
    farmers: { code: string; name: string }[]
    varieties: string[]
    irrigationTypes: string[]
    waterSources: string[]
    soilTypes: string[]
    seedTypes: string[]
  }
}

/** Collapses whitespace/case differences so "Co 86032", "co86032" and
 * "CO 86032" (or "Bore Well" / "BOREWELL" / "borewell") compare equal. */
export function normalizeFreeTextKey(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, '')
}

/** Builds a spelling-key -> canonical-spelling map from every raw value on
 * record for one column — when a normalized key has multiple real spellings
 * in production already (the typo problem may predate this feature), the
 * most frequent one wins, so new imports converge toward whatever's
 * actually dominant rather than an arbitrary pick. */
export function buildSpellingMap(rawValues: string[]): Map<string, string> {
  const countsByKey = new Map<string, Map<string, number>>()
  for (const raw of rawValues) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = normalizeFreeTextKey(trimmed)
    const counts = countsByKey.get(key) ?? new Map<string, number>()
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
    countsByKey.set(key, counts)
  }
  const result = new Map<string, string>()
  for (const [key, counts] of countsByKey) {
    let best = ''
    let bestCount = -1
    for (const [raw, count] of counts) {
      if (count > bestCount) {
        best = raw
        bestCount = count
      }
    }
    result.set(key, best)
  }
  return result
}

interface ResolvedFreeText {
  value: string
  isNew: boolean
}

/** Auto-corrects a typed value to whatever's already on record once
 * whitespace/case is normalized away; if nothing matches, keeps the typed
 * value as-is and flags it `isNew` — could be a genuinely new value, or an
 * uncaught typo, so it's surfaced for a second look rather than silently
 * either accepted or blocked (a hard whitelist would incorrectly reject
 * real new varieties/soil types/etc). */
function resolveFreeText(raw: string, bySpellingKey: Map<string, string>): ResolvedFreeText {
  const trimmed = raw.trim()
  if (!trimmed) return { value: '', isNew: false }
  const canonical = bySpellingKey.get(normalizeFreeTextKey(trimmed))
  return canonical ? { value: canonical, isNew: false } : { value: trimmed, isNew: true }
}

/** Variety needs one extra rule beyond resolveFreeText's plain DB-spelling
 * match: the "Co" (Coimbatore) sugarcane series' real convention is
 * "Co 86032" (a space between the letters and the number). Matching
 * against DB history alone isn't enough — if "CO86032" (wrongly formatted,
 * no space) is what's already on record from an earlier import, DB-history
 * matching would keep "correcting" every future entry BACK to that wrong
 * spelling, since normalizeFreeTextKey collapses both to the same key. So
 * for this one pattern, the naming rule itself wins over DB history —
 * always "Co ####", regardless of what's already on file. Every other
 * variety naming convention (e.g. "2003V46") still goes through the plain
 * DB-spelling match, unchanged. */
function resolveVariety(raw: string, bySpellingKey: Map<string, string>): ResolvedFreeText {
  const trimmed = raw.trim()
  if (!trimmed) return { value: '', isNew: false }
  const coMatch = trimmed.match(/^co\s*-?\s*(\d+[a-z]?)$/i)
  if (coMatch) return { value: `Co ${coMatch[1].toUpperCase()}`, isNew: false }
  return resolveFreeText(trimmed, bySpellingKey)
}

export interface ValidatedImportRow {
  rowNumber: number
  plotNo: string
  factoryCode: string
  divisionCode: string
  sectionCode: string
  villageCode: string
  /** Set when Farmer Code already exists. */
  farmerId: string | null
  farmerCode: string
  /** Set only when farmerId is set — the real name already on record for
   * this code, shown in the preview so a mismatch against a typed Farmer
   * Name (e.g. reusing someone else's code by mistake) is visible before
   * import, not discovered afterward in Supabase. */
  existingFarmerName: string | null
  /** Set only when farmerId is null — a new farmer to create inline. */
  newFarmerName: string | null
  newFarmerPhone: string | null
  plantingDate: string
  plantingSeason: string
  crushingSeason: string
  plotType: string
  cropType: string
  /** Variety/irrigation/water/soil/seed values are auto-corrected to
   * whatever's already on record once normalized (see resolveFreeText) —
   * `newFreeTextFields` lists which ones (if any) matched nothing and are
   * still exactly as typed, so the preview can flag them for a second look. */
  variety: string
  /** The exact text originally typed, only when Variety's "Co ####" naming
   * rule actually changed it (e.g. "co86032" -> "Co 86032") — surfaced in
   * the preview so the auto-correction is visible, not silent. */
  varietyAutoFormattedFrom: string | null
  irrigationType: string
  waterSource: string
  soilType: string
  seedType: string
  newFreeTextFields: { field: string; value: string }[]
  spacingFeet: string
  areaAcres: number
}

export interface ImportRowError {
  rowNumber: number
  plotNo: string
  errors: string[]
}

export interface ImportValidationResult {
  valid: ValidatedImportRow[]
  invalid: ImportRowError[]
}

/** Parses a raw sheet cell into a YYYY-MM-DD string — SheetJS (read with
 * `cellDates: true`) hands back a real `Date` for date-formatted cells, but
 * a plain string for text-formatted ones, so both need handling upstream;
 * by the time it reaches here the cell has already been coerced to string. */
function parseDateCell(value: string): string | null {
  if (!value.trim()) return null
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function validateImportRows(rows: ImportRowInput[], lookups: ImportLookups): ImportValidationResult {
  const valid: ValidatedImportRow[] = []
  const invalid: ImportRowError[] = []
  const seenInBatch = new Set<string>()
  const newFarmerCodesInBatch = new Map<string, string>() // farmerCode -> name, for within-batch reuse validation

  rows.forEach((row, i) => {
    const rowNumber = i + 2 // header is row 1 in the sheet
    const errors: string[] = []

    const plotNo = row.plotNo.trim()
    if (!plotNo) errors.push('Plot No is required')
    else if (lookups.existingPlotNos.has(plotNo)) errors.push('Plot No already exists')
    else if (seenInBatch.has(plotNo)) errors.push('Duplicate Plot No in this file')
    else seenInBatch.add(plotNo)

    const clientCode = row.clientCode.trim()
    const factoryCode = row.factoryCode.trim()
    const divisionCode = row.divisionCode.trim()
    const sectionCode = row.sectionCode.trim()
    const villageCode = row.villageCode.trim()

    if (!lookups.factoryCodes.has(factoryCode)) errors.push(`Unknown Factory Code "${factoryCode}"`)
    if (!lookups.divisionCodes.has(divisionCode)) errors.push(`Unknown Division Code "${divisionCode}"`)
    if (!lookups.sectionCodes.has(sectionCode)) errors.push(`Unknown Section Code "${sectionCode}"`)
    if (!lookups.villageCodes.has(villageCode)) errors.push(`Unknown Village Code "${villageCode}"`)
    if (clientCode && factoryCode && lookups.clientCodeByFactory.get(factoryCode) !== clientCode) {
      errors.push(`Client Code "${clientCode}" doesn't match Factory Code "${factoryCode}"'s real client`)
    }

    const farmerCode = row.farmerCode.trim()
    const farmerName = row.farmerName.trim()
    let farmerId: string | null = null
    let existingFarmerName: string | null = null
    let newFarmerName: string | null = null
    if (!farmerCode) {
      errors.push('Farmer Code is required')
    } else {
      farmerId = lookups.farmerIdByCode.get(farmerCode) ?? null
      if (farmerId) {
        existingFarmerName = lookups.farmerNameByCode.get(farmerCode) ?? null
      } else {
        // Not an existing farmer — this row is creating a new one.
        if (!farmerName) {
          errors.push(`Farmer Code "${farmerCode}" not found — Farmer Name is required to create a new farmer`)
        } else {
          const seenName = newFarmerCodesInBatch.get(farmerCode)
          if (seenName && seenName !== farmerName) {
            errors.push(`Farmer Code "${farmerCode}" used with a different Farmer Name earlier in this file`)
          } else {
            newFarmerCodesInBatch.set(farmerCode, farmerName)
            newFarmerName = farmerName
          }
        }
      }
    }

    const plantingDate = parseDateCell(row.plantingDate)
    if (!plantingDate) errors.push(`Invalid Planting Date "${row.plantingDate}"`)

    const plotType = row.plotType.trim().toUpperCase()
    if (!PLOTTYPE_ORDER.includes(plotType)) errors.push(`Plot Type must be one of ${PLOTTYPE_ORDER.join('/')}`)

    const cropType = row.cropType.trim().toUpperCase()
    if (!CROP_TYPE_VALUES.includes(cropType as (typeof CROP_TYPE_VALUES)[number])) {
      errors.push(`Crop Type must be one of ${CROP_TYPE_VALUES.join('/')}`)
    }

    if (!row.variety.trim()) errors.push('Variety is required')
    const varietyResolved = resolveVariety(row.variety, lookups.freeTextBySpellingKey.variety)
    const varietyAutoFormattedFrom =
      varietyResolved.value !== row.variety.trim() && row.variety.trim() ? row.variety.trim() : null
    const irrigationResolved = resolveFreeText(row.irrigationType, lookups.freeTextBySpellingKey.irrigationType)
    const waterSourceResolved = resolveFreeText(row.waterSource, lookups.freeTextBySpellingKey.waterSource)
    const soilTypeResolved = resolveFreeText(row.soilType, lookups.freeTextBySpellingKey.soilType)
    const seedTypeResolved = resolveFreeText(row.seedType, lookups.freeTextBySpellingKey.seedType)
    const newFreeTextFields = [
      ['Variety', varietyResolved] as const,
      ['Irrigation Type', irrigationResolved] as const,
      ['Water Source', waterSourceResolved] as const,
      ['Soil Type', soilTypeResolved] as const,
      ['Seed Type', seedTypeResolved] as const,
    ]
      .filter(([, r]) => r.isNew)
      .map(([field, r]) => ({ field, value: r.value }))

    const areaAcres = Number(row.areaAcres)
    if (!Number.isFinite(areaAcres) || areaAcres <= 0) {
      errors.push(`Area (Acres) must be a positive number, got "${row.areaAcres}"`)
    }

    if (errors.length > 0) {
      invalid.push({ rowNumber, plotNo: plotNo || `(row ${rowNumber})`, errors })
      return
    }

    valid.push({
      rowNumber,
      plotNo,
      factoryCode,
      divisionCode,
      sectionCode,
      villageCode,
      farmerId,
      farmerCode,
      existingFarmerName,
      newFarmerName,
      newFarmerPhone: newFarmerName ? row.farmerPhone.trim() || null : null,
      plantingDate: plantingDate!,
      plantingSeason: row.plantingSeason.trim(),
      crushingSeason: row.crushingSeason.trim(),
      plotType,
      cropType,
      variety: varietyResolved.value,
      varietyAutoFormattedFrom,
      irrigationType: irrigationResolved.value,
      waterSource: waterSourceResolved.value,
      soilType: soilTypeResolved.value,
      seedType: seedTypeResolved.value,
      newFreeTextFields,
      spacingFeet: row.spacingFeet.trim(),
      areaAcres,
    })
  })

  return { valid, invalid }
}
