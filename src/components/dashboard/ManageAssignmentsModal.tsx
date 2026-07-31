import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Field } from '../../features/fields/types'
import { OfficersRepository } from '../../features/officers/officersRepository'
import { useAssignments } from '../../features/officers/useAssignments'
import { useOfficers } from '../../features/officers/useOfficers'

const officersRepository = new OfficersRepository(supabase)

interface ManageAssignmentsModalProps {
  fields: Field[]
  onClose: () => void
}

/** The "undo a mistake" view — every currently-open scout-assignment
 * alert, cancellable. Fills the gap left by skipping source's dead Scout
 * Summary: that showed local export history, not real assignments; this
 * shows real `alerts` rows and can actually act on them. Requires the
 * `alerts_senior_update` RLS policy (admin/manager UPDATE on `alerts`) —
 * see officersRepository.ts's `cancelAssignment` docstring. */
export function ManageAssignmentsModal({ fields, onClose }: ManageAssignmentsModalProps) {
  const assignmentsQuery = useAssignments(true)
  const officersQuery = useOfficers()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  const fieldByCode = new Map(fields.map((f) => [f.code, f]))
  const officerById = new Map((officersQuery.data ?? []).map((o) => [o.id, o]))

  async function handleCancel(alertId: string) {
    setCancellingId(alertId)
    setErrorId(null)
    try {
      await officersRepository.cancelAssignment(alertId)
      await assignmentsQuery.refetch()
    } catch {
      setErrorId(alertId)
    } finally {
      setCancellingId(null)
      setConfirmingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">Manage Assignments</div>
            <div className="text-[11px] text-neutral-400">Currently open scout assignments — cancel any made by mistake.</div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(85vh - 70px)' }}>
          {assignmentsQuery.isLoading && <div className="py-6 text-center text-xs text-neutral-400">Loading assignments…</div>}
          {assignmentsQuery.isError && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              Could not load assignments. If this is your first time here, make sure the `alerts_senior_update` RLS
              policy has been applied (needed to read/update assignment status).
            </div>
          )}
          {assignmentsQuery.isSuccess && assignmentsQuery.data.length === 0 && (
            <div className="py-6 text-center text-xs text-neutral-400">No open assignments right now.</div>
          )}
          {assignmentsQuery.isSuccess && assignmentsQuery.data.length > 0 && (
            <div className="divide-y divide-neutral-100">
              {assignmentsQuery.data.map((a) => {
                const field = fieldByCode.get(a.plotCode)
                const officer = officerById.get(a.officerId)
                return (
                  <div key={a.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-neutral-700">
                          {field?.name || a.plotCode} <span className="font-normal text-neutral-400">· {a.plotCode}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-500">
                          → {officer?.name ?? 'Unknown officer'} {a.assignedDate ? `· ${a.assignedDate}` : ''}
                        </div>
                        {a.message && <div className="mt-1 text-[11px] text-neutral-400">{a.message}</div>}
                      </div>
                      <div className="shrink-0">
                        {confirmingId === a.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={cancellingId === a.id}
                              onClick={() => handleCancel(a.id)}
                              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                            >
                              {cancellingId === a.id ? 'Cancelling…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50"
                            >
                              Back
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(a.id)}
                            className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    {errorId === a.id && (
                      <div className="mt-1 text-[10px] text-red-500">Failed to cancel — check console for details.</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
