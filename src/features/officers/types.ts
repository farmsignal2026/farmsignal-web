/** A field officer eligible to be assigned scouting work — mirrors
 * `farm_officers` joined with `officer_divisions`. */
export interface Officer {
  id: string
  name: string
  phone: string | null
  role: string | null
  /** Division codes this officer covers — from `officer_divisions` when
   * present, falling back to the officer's own single `division_code`
   * (matches source's own fallback, RS_Cane_Monitoring_S1.html:6166). */
  divisionCodes: string[]
}

export interface AssignResult {
  okCount: number
  failed: { plotCode: string; message: string }[]
}

/** An open `alerts` row of type `scout_assignment` — a currently-active
 * assignment, cancellable by an admin/manager (see
 * `OfficersRepository.cancelAssignment`). */
export interface Assignment {
  id: string
  plotCode: string
  officerId: string
  message: string | null
  assignedDate: string | null
}
