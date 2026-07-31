import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../features/auth/useAuth'
import type { Field } from '../../features/fields/types'
import { OfficersRepository } from '../../features/officers/officersRepository'
import type { Officer } from '../../features/officers/types'
import { useOfficers } from '../../features/officers/useOfficers'

const officersRepository = new OfficersRepository(supabase)

interface AssignScoutModalProps {
  plotCodes: string[]
  fields: Field[]
  onClose: () => void
  onAssigned: () => void
}

/** Ports source's Assign Officer modal (`openAssignModal()`/`confirmAssign()`,
 * RS_Cane_Monitoring_S1.html:6118-6273) — pick a real, active officer who
 * covers at least one of the selected fields' divisions, then write one
 * `alerts` + `push_notifications` row per field. Matches on `divisionCode`
 * directly (Field already carries both the code and the display name),
 * simpler than source's own case-insensitive name-matching workaround,
 * which existed only because its field rows didn't carry a division code. */
export function AssignScoutModal({ plotCodes, fields, onClose, onAssigned }: AssignScoutModalProps) {
  const { user } = useAuth()
  const officersQuery = useOfficers()
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ okCount: number; failedCount: number; officerName: string } | null>(null)

  const selectedFields = useMemo(
    () => plotCodes.map((code) => fields.find((f) => f.code === code)).filter((f): f is Field => f != null),
    [plotCodes, fields],
  )

  const targetDivisionCodes = useMemo(
    () => new Set(selectedFields.map((f) => f.divisionCode).filter(Boolean)),
    [selectedFields],
  )

  const matchingOfficers = useMemo(() => {
    if (!officersQuery.data) return []
    return officersQuery.data.filter((o) => o.divisionCodes.some((dc) => targetDivisionCodes.has(dc)))
  }, [officersQuery.data, targetDivisionCodes])

  const summaryNames = selectedFields
    .slice(0, 5)
    .map((f) => f.name || f.code)
    .join(', ')
  const summaryMore = selectedFields.length > 5 ? ` +${selectedFields.length - 5} more` : ''

  async function handleConfirm() {
    const officer = matchingOfficers.find((o) => o.id === selectedOfficerId)
    if (!officer) return
    setSubmitting(true)
    const res = await officersRepository.assignFieldsToOfficer(plotCodes, officer, remark, user?.name ?? null)
    setSubmitting(false)
    setResult({ okCount: res.okCount, failedCount: res.failed.length, officerName: officer.name })
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-bold text-neutral-800">
            {result.okCount} field{result.okCount !== 1 ? 's' : ''} assigned to {result.officerName}
          </div>
          {result.failedCount > 0 && (
            <div className="mt-1.5 text-xs text-red-600">
              {result.failedCount} field{result.failedCount !== 1 ? 's' : ''} failed — check console for details.
            </div>
          )}
          <button
            type="button"
            onClick={onAssigned}
            className="mt-4 w-full rounded-md bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div className="text-sm font-bold text-neutral-800">Assign fields to officer</div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4" style={{ maxHeight: 'calc(85vh - 130px)' }}>
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <b>
              {plotCodes.length} field{plotCodes.length !== 1 ? 's' : ''} selected:
            </b>{' '}
            {summaryNames}
            {summaryMore}
          </div>

          <div className="text-xs font-medium text-neutral-500">Select officer to assign:</div>

          {officersQuery.isLoading && <div className="py-4 text-center text-xs text-neutral-400">Loading officers…</div>}
          {officersQuery.isError && (
            <div className="py-4 text-center text-xs text-red-500">Could not load officers.</div>
          )}
          {officersQuery.isSuccess && matchingOfficers.length === 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No active officer is currently assigned to{' '}
              {[...targetDivisionCodes].join(', ') || "these fields' division"}. Check the officer's division in
              Supabase (`farm_officers` / `officer_divisions`).
            </div>
          )}
          {officersQuery.isSuccess && matchingOfficers.length > 0 && (
            <div className="space-y-1.5">
              {matchingOfficers.map((o) => (
                <OfficerRow key={o.id} officer={o} selected={o.id === selectedOfficerId} onSelect={() => setSelectedOfficerId(o.id)} />
              ))}
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">
              Remarks <span className="font-normal text-neutral-400">(optional — shown to the officer)</span>
            </div>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="e.g. Check for pest damage on the eastern edge"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-green-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedOfficerId || submitting}
            onClick={handleConfirm}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            {submitting ? 'Assigning…' : 'Confirm assignment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OfficerRow({ officer, selected, onSelect }: { officer: Officer; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md border p-2 text-left ${
        selected ? 'border-green-400 bg-green-50' : 'border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      <input type="radio" checked={selected} readOnly className="h-3.5 w-3.5" />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-neutral-700">
          {officer.name} <span className="font-normal text-neutral-400">({officer.role || '—'})</span>
        </div>
        <div className="text-[11px] text-neutral-400">
          {officer.phone || 'No phone'} · {officer.divisionCodes.join(', ')}
        </div>
      </div>
    </button>
  )
}
