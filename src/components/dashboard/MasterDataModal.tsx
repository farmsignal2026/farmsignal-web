import { useEffect, useMemo, useState } from 'react'
import { MasterDataRepository } from '../../features/masterData/masterDataRepository'
import { supabase } from '../../lib/supabaseClient'

const repo = new MasterDataRepository(supabase)

interface MasterDataModalProps {
  onClose: () => void
}

interface ColumnDef {
  key: string
  label: string
  type: 'text' | 'select'
  options?: { value: string; label: string }[]
  optional?: boolean
}

interface GenericRow {
  id: string
  deleteKey: string
  values: Record<string, string>
}

/** Shared list/add/edit/delete table for one master-data tab — the 4 tabs
 * differ only in which columns they show and where a `select` column's
 * options come from, so one generic table avoids 4 near-identical copies of
 * the same inline-edit-row UI already established by ThresholdsModal /
 * ManageOfficersModal. */
function MasterDataTable({
  columns,
  rows,
  onAdd,
  onSave,
  onDelete,
  addLabel,
}: {
  columns: ColumnDef[]
  rows: GenericRow[]
  onAdd: (values: Record<string, string>) => Promise<void>
  onSave: (id: string, values: Record<string, string>) => Promise<void>
  onDelete: (row: GenericRow) => Promise<void>
  addLabel: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addValues, setAddValues] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit(r: GenericRow) {
    setEditingId(r.id)
    setEditValues(r.values)
    setError(null)
  }

  async function saveEdit(r: GenericRow) {
    for (const c of columns) {
      if (!c.optional && !editValues[c.key]?.trim()) {
        setError(`${c.label} is required.`)
        return
      }
    }
    setSavingId(r.id)
    setError(null)
    try {
      await onSave(r.id, editValues)
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function deleteRow(r: GenericRow) {
    if (!window.confirm(`Delete this row?`)) return
    setSavingId(r.id)
    setError(null)
    try {
      await onDelete(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  async function submitAdd() {
    for (const c of columns) {
      if (!c.optional && !addValues[c.key]?.trim()) {
        setError(`${c.label} is required.`)
        return
      }
    }
    setAdding(true)
    setError(null)
    try {
      await onAdd(addValues)
      setShowAddForm(false)
      setAddValues({})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  function renderField(
    col: ColumnDef,
    value: string,
    onChange: (v: string) => void,
  ) {
    if (col.type === 'select') {
      return (
        <select
          className="rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    return (
      <input
        className="w-24 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editingId === r.id
              return (
                <tr key={r.id} className="border-t border-neutral-100">
                  {columns.map((c) =>
                    isEditing ? (
                      <td key={c.key} className="px-1 py-1">
                        {renderField(c, editValues[c.key] ?? '', (v) => setEditValues({ ...editValues, [c.key]: v }))}
                      </td>
                    ) : (
                      <td key={c.key} className="px-2 py-1 text-neutral-600">
                        {c.type === 'select'
                          ? (col => col?.options?.find((o) => o.value === r.values[c.key])?.label ?? r.values[c.key])(c)
                          : r.values[c.key] || '—'}
                      </td>
                    ),
                  )}
                  <td className="whitespace-nowrap px-2 py-1">
                    {isEditing ? (
                      <>
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
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
        >
          {addLabel}
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-dashed border-neutral-300 p-3">
          <div className="flex flex-wrap gap-2">
            {columns.map((c) => (
              <label key={c.key} className="text-[11px] text-neutral-500">
                {c.label}
                <br />
                {renderField(c, addValues[c.key] ?? '', (v) => setAddValues({ ...addValues, [c.key]: v }))}
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={adding}
              onClick={submitAdd}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            >
              {adding ? 'Adding…' : 'Add'}
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
  )
}

type Tab = 'clients' | 'factories' | 'divisions' | 'sections' | 'villages'

/** Master Data admin — "🗂️ Master Data" nav button (DashboardShell.tsx),
 * gated `isSuperAdmin` same as the 5 tables' own write RLS. Covers the real
 * plot-hierarchy tables (Client -> Factory -> Division -> Section ->
 * Village) — "Varieties" from the original spec isn't a real master table
 * (variety is free text on plots, already typo-corrected against history at
 * import time — see import.ts), so there's no CRUD screen for it here.
 * Clients tab manages `client_master`, which today is disconnected from the
 * rest of the app (see masterDataRepository.ts's docstring) — Factory's own
 * Client Code field stays free text, not a dropdown sourced from this list. */
export function MasterDataModal({ onClose }: MasterDataModalProps) {
  const [tab, setTab] = useState<Tab>('clients')
  const [clients, setClients] = useState<Awaited<ReturnType<typeof repo.listClients>>>([])
  const [factories, setFactories] = useState<Awaited<ReturnType<typeof repo.listFactories>>>([])
  const [divisions, setDivisions] = useState<Awaited<ReturnType<typeof repo.listDivisions>>>([])
  const [sections, setSections] = useState<Awaited<ReturnType<typeof repo.listSections>>>([])
  const [villages, setVillages] = useState<Awaited<ReturnType<typeof repo.listVillages>>>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setLoadError(null)
    Promise.all([repo.listClients(), repo.listFactories(), repo.listDivisions(), repo.listSections(), repo.listVillages()])
      .then(([c, f, d, s, v]) => {
        setClients(c)
        setFactories(f)
        setDivisions(d)
        setSections(s)
        setVillages(v)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const factoryOptions = useMemo(() => factories.map((f) => ({ value: f.code, label: `${f.name} (${f.code})` })), [factories])
  const divisionOptions = useMemo(() => divisions.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` })), [divisions])
  const sectionOptions = useMemo(() => sections.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` })), [sections])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'clients', label: 'Clients' },
    { key: 'factories', label: 'Factories' },
    { key: 'divisions', label: 'Divisions' },
    { key: 'sections', label: 'Sections' },
    { key: 'villages', label: 'Villages' },
  ]

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-lg bg-white shadow-xl"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-4">
          <div>
            <div className="text-sm font-bold text-neutral-800">🗂️ Master Data</div>
            <div className="text-[11px] text-neutral-400">Client → Factory → Division → Section → Village hierarchy.</div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-neutral-100 px-4 pt-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-semibold ${
                tab === t.key ? 'border border-b-0 border-neutral-200 bg-white text-green-700' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 overflow-y-auto p-4 text-sm" style={{ maxHeight: 'calc(88vh - 170px)' }}>
          {loading && <div className="py-8 text-center text-xs text-neutral-400">Loading…</div>}
          {loadError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</div>}

          {!loading && !loadError && tab === 'clients' && (
            <MasterDataTable
              columns={[
                { key: 'code', label: 'Code', type: 'text' },
                { key: 'name', label: 'Name', type: 'text' },
              ]}
              rows={clients.map((c) => ({
                id: c.id,
                deleteKey: c.code,
                values: { code: c.code, name: c.name },
              }))}
              addLabel="+ Add client"
              onAdd={async (v) => {
                await repo.insertClient({ code: v.code, name: v.name })
                load()
              }}
              onSave={async (id, v) => {
                await repo.updateClient(id, { code: v.code, name: v.name })
                load()
              }}
              onDelete={async (r) => {
                await repo.deleteClient(r.deleteKey, r.values.name)
                load()
              }}
            />
          )}

          {!loading && !loadError && tab === 'factories' && (
            <MasterDataTable
              columns={[
                { key: 'code', label: 'Code', type: 'text' },
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'clientCode', label: 'Client Code', type: 'text' },
              ]}
              rows={factories.map((f) => ({
                id: f.id,
                deleteKey: f.code,
                values: { code: f.code, name: f.name, clientCode: f.clientCode ?? '' },
              }))}
              addLabel="+ Add factory"
              onAdd={async (v) => {
                await repo.insertFactory({ code: v.code, name: v.name, clientCode: v.clientCode || null })
                load()
              }}
              onSave={async (id, v) => {
                await repo.updateFactory(id, { code: v.code, name: v.name, clientCode: v.clientCode || null })
                load()
              }}
              onDelete={async (r) => {
                await repo.deleteFactory(r.deleteKey)
                load()
              }}
            />
          )}

          {!loading && !loadError && tab === 'divisions' && (
            <MasterDataTable
              columns={[
                { key: 'code', label: 'Code', type: 'text' },
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'factoryCode', label: 'Factory', type: 'select', options: factoryOptions },
              ]}
              rows={divisions.map((d) => ({
                id: d.id,
                deleteKey: d.code,
                values: { code: d.code, name: d.name, factoryCode: d.factoryCode },
              }))}
              addLabel="+ Add division"
              onAdd={async (v) => {
                await repo.insertDivision({ code: v.code, name: v.name, factoryCode: v.factoryCode })
                load()
              }}
              onSave={async (id, v) => {
                await repo.updateDivision(id, { code: v.code, name: v.name, factoryCode: v.factoryCode })
                load()
              }}
              onDelete={async (r) => {
                await repo.deleteDivision(r.deleteKey)
                load()
              }}
            />
          )}

          {!loading && !loadError && tab === 'sections' && (
            <MasterDataTable
              columns={[
                { key: 'code', label: 'Code', type: 'text' },
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'divisionCode', label: 'Division', type: 'select', options: divisionOptions },
                { key: 'description', label: 'Description', type: 'text', optional: true },
              ]}
              rows={sections.map((s) => ({
                id: s.id,
                deleteKey: s.code,
                values: { code: s.code, name: s.name, divisionCode: s.divisionCode, description: s.description ?? '' },
              }))}
              addLabel="+ Add section"
              onAdd={async (v) => {
                await repo.insertSection({
                  code: v.code,
                  name: v.name,
                  divisionCode: v.divisionCode,
                  description: v.description || null,
                })
                load()
              }}
              onSave={async (id, v) => {
                await repo.updateSection(id, {
                  code: v.code,
                  name: v.name,
                  divisionCode: v.divisionCode,
                  description: v.description || null,
                })
                load()
              }}
              onDelete={async (r) => {
                await repo.deleteSection(r.deleteKey)
                load()
              }}
            />
          )}

          {!loading && !loadError && tab === 'villages' && (
            <MasterDataTable
              columns={[
                { key: 'code', label: 'Code', type: 'text' },
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'sectionCode', label: 'Section', type: 'select', options: sectionOptions },
                { key: 'district', label: 'District', type: 'text', optional: true },
                { key: 'state', label: 'State', type: 'text', optional: true },
                { key: 'taluk', label: 'Taluk', type: 'text', optional: true },
              ]}
              rows={villages.map((v) => ({
                id: v.id,
                deleteKey: v.id,
                values: {
                  code: v.code,
                  name: v.name,
                  sectionCode: v.sectionCode,
                  district: v.district ?? '',
                  state: v.state ?? '',
                  taluk: v.taluk ?? '',
                },
              }))}
              addLabel="+ Add village"
              onAdd={async (v) => {
                await repo.insertVillage({
                  code: v.code,
                  name: v.name,
                  sectionCode: v.sectionCode,
                  district: v.district || null,
                  state: v.state || null,
                  taluk: v.taluk || null,
                })
                load()
              }}
              onSave={async (id, v) => {
                await repo.updateVillage(id, {
                  code: v.code,
                  name: v.name,
                  sectionCode: v.sectionCode,
                  district: v.district || null,
                  state: v.state || null,
                  taluk: v.taluk || null,
                })
                load()
              }}
              onDelete={async (r) => {
                await repo.deleteVillage(r.deleteKey)
                load()
              }}
            />
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
