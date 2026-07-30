/** Ports the "Plant Season Engine" (RS_Cane_Monitoring_S1.html:1990-2029) —
 * a season runs 1-Nov-YYYY to 31-Oct-(YYYY+1), labelled "YYYY-YY+1". No
 * hardcoded season list: any plant date maps to its season automatically,
 * so this keeps working indefinitely as new seasons begin. */
export function seasonStartYearFor(date: Date | null): number | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = date.getMonth() // 0=Jan..11=Dec
  return m >= 10 ? y : y - 1
}

export function seasonLabelForYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function getCurrentSeasonStartYear(): number {
  return seasonStartYearFor(new Date())!
}
