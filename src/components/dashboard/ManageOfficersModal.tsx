import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import {
  OFFICER_ROLES,
  OfficerAdminRepository,
  type DivisionOption,
  type FactoryOption,
  type OfficerAdminInput,
  type OfficerAdminRow,
} from '../../features/officers/officerAdminRepository'
import { supabase } from '../../lib/supabaseClient'

const repo = new OfficerAdminRepository(supabase)

interface ManageOfficersModalProps {
  onClose: () => void
}

interface EditForm {
  name: string
  email: string
  role: string
  clientCode: string
  factoryCode: string
  divisionCodes: string[]
  isSuperAdmin: boolean
  receivesExecutiveReport: boolean
}

function toEditForm(o: OfficerAdminRow): EditForm {
  return {
    name: o.name,
    email: o.email ?? '',
    role: o.role ?? '',
    clientCode: o.clientCode ?? '',
    factoryCode: o.factoryCode ?? '',
    divisionCodes: o.divisionCodes,
    isSuperAdmin: o.isSuperAdmin,
    receivesExecutiveReport: o.receivesExecutiveReport,
  }
}

type SortKey = 'name' | 'role' | 'client' | 'factory'

/** Manage Officers admin — "👤 Manage Officers" nav button (DashboardShell.tsx),
 * gated `isSuperAdmin` same as farm_officers' own UPDATE RLS policy. Edit +
 * deactivate/reactivate only — creating a brand-new login needs a
 * service-role Edge Function and is explicitly out of scope this pass (see
 * the plan's Feature 2 scope note). Reuses `ImportFieldsModal.tsx`'s modal
 * shell and `ThresholdsModal.tsx`'s inline-edit-row pattern. */
export function ManageOfficersModal({ onClose }: ManageOfficersModalProps) {
  const { user } = useAuth()
  const [officers, setOfficers] = useState<OfficerAdminRow[]>([])
  const [factories, setFactories] = useState<FactoryOption[]>([])
  const [divisions, setDivisions] = useState<DivisionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    email: '',
    role: '',
    clientCode: '',
    factoryCode: '',
    divisionCodes: [],
    isSuperAdmin: false,
    receivesExecutiveReport: false,
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')

  function load() {
    setLoading(true)
    setLoadError(null)
    Promise.all([repo.listAll(), repo.listFactories(), repo.listDivisions()])
      .then(([o, f, d]) => {
        setOfficers(o)
        setFactories(f)
        setDivisions(d)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const clientCodes = useMemo(
    () => Array.from(new Set(factories.map((f) => f.clientCode).filter((c): c is string => c != null))).sort(),
    [factories],
  )
  const factoriesForEditClient = useMemo(
    () => (editForm.clientCode ? factories.filter((f) => f.clientCode === editForm.clientCode) : factories),
    [factories, editForm.clientCode],
  )
  const divisionsForEditFactory = useMemo(
    () => (editForm.factoryCode ? divisions.filter((d) => d.factoryCode === editForm.factoryCode) : []),
    [divisions, editForm.factoryCode],
  )

  const divisionNameByCode = useMemo(() => new Map(divisions.map((d) => [d.code, d.name])), [divisions])

  const visibleOfficers = useMemo(() => {
    const filtered = officers.filter((o) => (showInactive ? !o.isActive : o.isActive))
    const key = (o: OfficerAdminRow) => {
      if (sortKey === 'role') return o.role ?? ''
      if (sortKey === 'client') return o.clientCode ?? ''
      if (sortKey === 'factory') return o.factoryCode ?? ''
      return o.name
    }
    return [...filtered].sort((a, b) => key(a).localeCompare(key(b)) || a.name.localeCompare(b.name))
  }, [officers, showInactive, sortKey])

  function startEdit(o: OfficerAdminRow) {
    setEditingId(o.id)
    setEditForm(toEditForm(o))
    setActionError(null)
  }

  async function saveEdit(o: OfficerAdminRow) {
    if (!editForm.name.trim()) {
      setActionError('Name is required.')
      return
    }
    setSavingId(o.id)
    setActionError(null)
    try {
      const input: OfficerAdminInput = {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        role: editForm.role || null,
        clientCode: editForm.clientCode || null,
        factoryCode: editForm.factoryCode || null,
        divisionCodes: editForm.divisionCodes,
        isSuperAdmin: o.id === user?.officerId ? o.isSuperAdmin : editForm.isSuperAdmin,
        receivesExecutiveReport: editForm.receivesExecutiveReport,
      }
      await repo.update(o.id, input)
      setEditingId(null)
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(o: OfficerAdminRow) {
    if (o.id === user?.officerId) return
    const verb = o.isActive ? 'deactivate' : 'reactivate'
    if (!window.confirm(`${verb === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${o.name}? ${o.isActive ? 'This blocks their mobile app login immediately.' : ''}`)) {
      return
    }
    setSavingId(o.id)
    setActionError(null)
    try {
      await repo.setActive(o.id, !o.isActive)
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">👤 Manage Officers</div>
            <div className="text-[11px] text-neutral-400">Edit role/scope or deactivate an existing login.</div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4 text-sm" style={{ maxHeight: 'calc(92vh - 130px)' }}>
          {loading && <div className="py-8 text-center text-xs text-neutral-400">Loading…</div>}
          {loadError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</div>}
          {actionError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}

          {!loading && !loadError && (
            <>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                  Show deactivated officers only
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  Sort by
                  <select
                    className="rounded border border-neutral-300 px-1 py-0.5"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="name">Name</option>
                    <option value="role">Role</option>
                    <option value="client">Client</option>
                    <option value="factory">Factory</option>
                  </select>
                </label>
              </div>

              <div
                className="overflow-auto rounded-md border border-neutral-200"
                style={{ maxHeight: 'calc(92vh - 260px)' }}
              >
                <table className="w-full text-left text-[11px]">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Name</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Phone</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Email</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Role</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Client</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Factory</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Division</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Super Admin</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Exec Report</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium">Status</th>
                      <th className="sticky top-0 z-10 bg-neutral-50 px-2 py-1.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOfficers.map((o) => {
                      const isEditing = editingId === o.id
                      const isSelf = o.id === user?.officerId
                      return (
                        <tr key={o.id} className={`border-t border-neutral-100 ${!o.isActive ? 'opacity-50' : ''}`}>
                          {isEditing ? (
                            <>
                              <td className="px-1 py-1">
                                <input
                                  className="w-28 rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1 text-neutral-500">{o.phone ?? '—'}</td>
                              <td className="px-1 py-1">
                                <input
                                  className="w-32 rounded border border-neutral-300 px-1 py-0.5"
                                  placeholder="name@example.com"
                                  value={editForm.email}
                                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  className="rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.role}
                                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                >
                                  <option value="">—</option>
                                  {OFFICER_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  className="rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.clientCode}
                                  onChange={(e) => setEditForm({ ...editForm, clientCode: e.target.value, factoryCode: '', divisionCodes: [] })}
                                >
                                  <option value="">(all clients)</option>
                                  {clientCodes.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  className="rounded border border-neutral-300 px-1 py-0.5"
                                  value={editForm.factoryCode}
                                  onChange={(e) => setEditForm({ ...editForm, factoryCode: e.target.value, divisionCodes: [] })}
                                >
                                  <option value="">(none)</option>
                                  {factoriesForEditClient.map((f) => (
                                    <option key={f.code} value={f.code}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                {!editForm.factoryCode ? (
                                  <span className="text-neutral-400">(pick a factory)</span>
                                ) : divisionsForEditFactory.length === 0 ? (
                                  <span className="text-neutral-400">(no divisions)</span>
                                ) : (
                                  <div className="max-h-24 w-32 space-y-0.5 overflow-y-auto rounded border border-neutral-300 p-1">
                                    {divisionsForEditFactory.map((d) => (
                                      <label key={d.code} className="flex items-center gap-1">
                                        <input
                                          type="checkbox"
                                          checked={editForm.divisionCodes.includes(d.code)}
                                          onChange={(e) =>
                                            setEditForm({
                                              ...editForm,
                                              divisionCodes: e.target.checked
                                                ? [...editForm.divisionCodes, d.code]
                                                : editForm.divisionCodes.filter((c) => c !== d.code),
                                            })
                                          }
                                        />
                                        {d.name}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={editForm.isSuperAdmin}
                                  disabled={isSelf}
                                  title={isSelf ? "Can't change your own Super Admin flag here" : undefined}
                                  onChange={(e) => setEditForm({ ...editForm, isSuperAdmin: e.target.checked })}
                                />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={editForm.receivesExecutiveReport}
                                  onChange={(e) => setEditForm({ ...editForm, receivesExecutiveReport: e.target.checked })}
                                />
                              </td>
                              <td className="px-2 py-1 text-neutral-500">{o.isActive ? 'Active' : 'Inactive'}</td>
                              <td className="whitespace-nowrap px-2 py-1">
                                <button
                                  type="button"
                                  disabled={savingId === o.id}
                                  onClick={() => saveEdit(o)}
                                  className="mr-1 rounded bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                                >
                                  {savingId === o.id ? 'Saving…' : 'Save'}
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
                              <td className="px-2 py-1 font-medium text-neutral-700">
                                {o.name}
                                {isSelf && <span className="ml-1 text-[10px] text-neutral-400">(you)</span>}
                              </td>
                              <td className="px-2 py-1 text-neutral-500">{o.phone ?? '—'}</td>
                              <td className="px-2 py-1 text-neutral-500">{o.email ?? '—'}</td>
                              <td className="px-2 py-1 text-neutral-600">{o.role ?? '—'}</td>
                              <td className="px-2 py-1 text-neutral-600">{o.clientCode ?? '—'}</td>
                              <td className="px-2 py-1 text-neutral-600">{o.factoryCode ?? '—'}</td>
                              <td className="px-2 py-1 text-neutral-600">
                                {o.divisionCodes.length === 0
                                  ? '—'
                                  : o.divisionCodes.map((c) => divisionNameByCode.get(c) ?? c).join(', ')}
                              </td>
                              <td className="px-2 py-1 text-center">{o.isSuperAdmin ? '✅' : ''}</td>
                              <td className="px-2 py-1 text-center">{o.receivesExecutiveReport ? '✅' : ''}</td>
                              <td className="px-2 py-1">
                                <span className={o.isActive ? 'text-green-700' : 'text-neutral-400'}>
                                  {o.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() => startEdit(o)}
                                  className="mr-1 rounded border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === o.id || isSelf}
                                  title={isSelf ? "Can't deactivate your own login here" : undefined}
                                  onClick={() => toggleActive(o)}
                                  className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-40"
                                >
                                  {o.isActive ? 'Deactivate' : 'Reactivate'}
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
            </>
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
