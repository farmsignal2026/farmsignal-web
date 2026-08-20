import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import {
  STAGE_NAMES,
  ThresholdsRepository,
  type FactoryOption,
  type ThresholdAdminRow,
  type ThresholdInput,
} from '../../features/fields/thresholdsRepository'
import { supabase } from '../../lib/supabaseClient'

const repo = new ThresholdsRepository(supabase)

interface ThresholdsModalProps {
  onClose: () => void
}

interface EditForm {
  dayMin: string
  dayMax: string
  ndviMin: string
  ndviMax: string
}

function toEditForm(r: ThresholdAdminRow): EditForm {
  return { dayMin: String(r.dayMin), dayMax: String(r.dayMax), ndviMin: String(r.ndviMin), ndviMax: String(r.ndviMax) }
}

function validate(form: EditForm): string | null {
  const dayMin = Number(form.dayMin)
  const dayMax = Number(form.dayMax)
  const ndviMin = Number(form.ndviMin)
  const ndviMax = Number(form.ndviMax)
  if (!Number.isFinite(dayMin) || !Number.isFinite(dayMax) || !Number.isFinite(ndviMin) || !Number.isFinite(ndviMax)) {
    return 'All four fields must be numbers.'
  }
  if (dayMax <= dayMin) return 'Day Max must be greater than Day Min.'
  if (ndviMax <= ndviMin) return 'NDVI Max must be greater than NDVI Min.'
  if (ndviMin < 0 || ndviMax > 1) return 'NDVI values must be between 0 and 1.'
  return null
}

/** Thresholds admin — "⚙️ Thresholds" nav button (DashboardShell.tsx), gated
 * `isSuperAdmin` same as this table's own RLS write policies. Rows grouped
 * Global default → Client-wide → Factory-specific, matching the most-
 * specific-wins resolution order in thresholds.ts's `resolveStagesForFactory`,
 * with that resolution order called out inline so it's not just implicit in
 * the grouping. Reuses `ImportFieldsModal.tsx`'s modal shell pattern. */
export function ThresholdsModal({ onClose }: ThresholdsModalProps) {
  const { user } = useAuth()
  const [rows, setRows] = useState<ThresholdAdminRow[]>([])
  const [factories, setFactories] = useState<FactoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ dayMin: '', dayMax: '', ndviMin: '', ndviMax: '' })
  const [savingId, setSavingId] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addClientCode, setAddClientCode] = useState<string>('')
  const [addFactoryCode, setAddFactoryCode] = useState<string>('')
  const [addStageName, setAddStageName] = useState<string>('')
  const [addForm, setAddForm] = useState<EditForm>({ dayMin: '', dayMax: '', ndviMin: '', ndviMax: '' })
  const [adding, setAdding] = useState(false)

  function load() {
    setLoading(true)
    setLoadError(null)
    Promise.all([repo.listAll(), repo.listFactories()])
      .then(([r, f]) => {
        setRows(r)
        setFactories(f)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const clientCodes = useMemo(
    () => Array.from(new Set(factories.map((f) => f.clientCode).filter((c): c is string => c != null))).sort(),
    [factories],
  )
  const factoriesForAddClient = useMemo(
    () => factories.filter((f) => f.clientCode === addClientCode),
    [factories, addClientCode],
  )

  const groups = useMemo(() => {
    const byKey = new Map<string, { clientCode: string | null; factoryCode: string | null; rows: ThresholdAdminRow[] }>()
    for (const r of rows) {
      const key = `${r.clientCode ?? ''}|${r.factoryCode ?? ''}`
      if (!byKey.has(key)) byKey.set(key, { clientCode: r.clientCode, factoryCode: r.factoryCode, rows: [] })
      byKey.get(key)!.rows.push(r)
    }
    return Array.from(byKey.values())
  }, [rows])

  function groupLabel(clientCode: string | null, factoryCode: string | null): string {
    if (clientCode === null) return 'Global default — applies to every client with no override'
    if (factoryCode === null) return `${clientCode} — client-wide (overrides global default for all ${clientCode} factories)`
    const fac = factories.find((f) => f.code === factoryCode)
    return `${clientCode} / ${fac?.name ?? factoryCode} — factory-specific (overrides ${clientCode}'s client-wide setting)`
  }

  function startEdit(r: ThresholdAdminRow) {
    setEditingId(r.id)
    setEditForm(toEditForm(r))
    setActionError(null)
  }

  async function saveEdit(r: ThresholdAdminRow) {
    const err = validate(editForm)
    if (err) {
      setActionError(err)
      return
    }
    setSavingId(r.id)
    setActionError(null)
    try {
      const input: ThresholdInput = {
        crop: r.crop,
        clientCode: r.clientCode,
        factoryCode: r.factoryCode,
        stageName: r.stageName,
        stageOrder: r.stageOrder,
        dayMin: Number(editForm.dayMin),
        dayMax: Number(editForm.dayMax),
        ndviMin: Number(editForm.ndviMin),
        ndviMax: Number(editForm.ndviMax),
      }
      await repo.update(r.id, input, user?.officerId ?? null)
      setEditingId(null)
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function deleteRow(r: ThresholdAdminRow) {
    if (!window.confirm(`Remove this ${r.stageName} threshold row? Fields will fall back to the next-broadest rule.`)) {
      return
    }
    setSavingId(r.id)
    setActionError(null)
    try {
      await repo.remove(r.id)
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function submitAdd() {
    const err = validate(addForm)
    if (err) {
      setActionError(err)
      return
    }
    if (!addStageName) {
      setActionError('Pick a stage.')
      return
    }
    if (addFactoryCode && !addClientCode) {
      setActionError('A factory-specific row needs a Client too.')
      return
    }
    const stage = STAGE_NAMES.find((s) => s.name === addStageName)!
    setAdding(true)
    setActionError(null)
    try {
      const input: ThresholdInput = {
        crop: 'Sugarcane',
        clientCode: addClientCode || null,
        factoryCode: addFactoryCode || null,
        stageName: addStageName,
        stageOrder: stage.order,
        dayMin: Number(addForm.dayMin),
        dayMax: Number(addForm.dayMax),
        ndviMin: Number(addForm.ndviMin),
        ndviMax: Number(addForm.ndviMax),
      }
      await repo.insert(input, user?.officerId ?? null)
      setShowAddForm(false)
      setAddClientCode('')
      setAddFactoryCode('')
      setAddStageName('')
      setAddForm({ dayMin: '', dayMax: '', ndviMin: '', ndviMax: '' })
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">⚙️ Crop-Stage Thresholds</div>
            <div className="text-[11px] text-neutral-400">
              Factory-specific overrides client-wide, which overrides the global default.
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-sm" style={{ maxHeight: 'calc(88vh - 130px)' }}>
          {loading && <div className="py-8 text-center text-xs text-neutral-400">Loading…</div>}
          {loadError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</div>}
          {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}

          {!loading &&
            !loadError &&
            groups.map((g) => (
              <div key={`${g.clientCode ?? ''}|${g.factoryCode ?? ''}`} className="rounded-md border border-neutral-200">
                <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-600">
                  {groupLabel(g.clientCode, g.factoryCode)}
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="px-2 py-1 font-medium">Stage</th>
                      <th className="px-2 py-1 font-medium">Day Min</th>
                      <th className="px-2 py-1 font-medium">Day Max</th>
                      <th className="px-2 py-1 font-medium">NDVI Min</th>
                      <th className="px-2 py-1 font-medium">NDVI Max</th>
                      <th className="px-2 py-1 font-medium">Updated</th>
                      <th className="px-2 py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const isEditing = editingId === r.id
                      return (
                        <tr key={r.id} className="border-t border-neutral-100">
                          <td className="px-2 py-1 font-medium text-neutral-700">{r.stageName}</td>
                          {isEditing ? (
                            <>
                              <td className="px-1 py-1">
                                <input
                                  className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.dayMin}
                                  onChange={(e) => setEditForm({ ...editForm, dayMin: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.dayMax}
                                  onChange={(e) => setEditForm({ ...editForm, dayMax: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.ndviMin}
                                  onChange={(e) => setEditForm({ ...editForm, ndviMin: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.ndviMax}
                                  onChange={(e) => setEditForm({ ...editForm, ndviMax: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1 text-neutral-400">—</td>
                              <td className="whitespace-nowrap px-2 py-1">
                                <button
                                  type="button"
                                  disabled={savingId === r.id}
                                  onClick={() => saveEdit(r)}
                                  className="mr-1 rounded bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                                >
                                  {savingId === r.id ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-1 text-neutral-600">{r.dayMin}</td>
                              <td className="px-2 py-1 text-neutral-600">{r.dayMax}</td>
                              <td className="px-2 py-1 text-neutral-600">{r.ndviMin.toFixed(2)}</td>
                              <td className="px-2 py-1 text-neutral-600">{r.ndviMax.toFixed(2)}</td>
                              <td className="px-2 py-1 text-neutral-400">
                                {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                                {r.updatedByName ? ` · ${r.updatedByName}` : ''}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() => startEdit(r)}
                                  className="mr-1 rounded border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === r.id}
                                  onClick={() => deleteRow(r)}
                                  className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-40"
                                >
                                  Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}

          {!loading && !loadError && (
            <div className="rounded-md border border-dashed border-neutral-300 p-3">
              {!showAddForm ? (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  + Add override row
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-neutral-700">Add a new threshold row</div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      value={addClientCode}
                      onChange={(e) => {
                        setAddClientCode(e.target.value)
                        setAddFactoryCode('')
                      }}
                    >
                      <option value="">Global default (no client)</option>
                      {clientCodes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      value={addFactoryCode}
                      onChange={(e) => setAddFactoryCode(e.target.value)}
                      disabled={!addClientCode}
                    >
                      <option value="">Client-wide (no specific factory)</option>
                      {factoriesForAddClient.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      value={addStageName}
                      onChange={(e) => setAddStageName(e.target.value)}
                    >
                      <option value="">Choose stage…</option>
                      {STAGE_NAMES.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-neutral-500">
                      Day Min{' '}
                      <input
                        className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                        value={addForm.dayMin}
                        onChange={(e) => setAddForm({ ...addForm, dayMin: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-neutral-500">
                      Day Max{' '}
                      <input
                        className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                        value={addForm.dayMax}
                        onChange={(e) => setAddForm({ ...addForm, dayMax: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-neutral-500">
                      NDVI Min{' '}
                      <input
                        className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                        value={addForm.ndviMin}
                        onChange={(e) => setAddForm({ ...addForm, ndviMin: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-neutral-500">
                      NDVI Max{' '}
                      <input
                        className="w-16 rounded border border-neutral-300 px-1 py-0.5"
                        value={addForm.ndviMax}
                        onChange={(e) => setAddForm({ ...addForm, ndviMax: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={adding}
                      onClick={submitAdd}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                    >
                      {adding ? 'Adding…' : 'Add row'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
