import { useEffect, useRef, useState } from 'react'

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectDropdownProps {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  searchable?: boolean
  placeholder?: string
}

/** Checkbox-list multi-select dropdown — ports the custom "pmwrap/pdd"
 * multi-select pattern (RS_Cane_Monitoring_S1.html:641-686) used for Plant
 * Season and Farmer. Empty selection means "show all", same convention as
 * every other multi-select filter in the source app. */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  placeholder = 'All',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    onChange(next)
  }

  const filteredOptions = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const triggerText =
    selected.length === 0
      ? placeholder
      : selected
          .map((v) => options.find((o) => o.value === v)?.label ?? v)
          .join(', ')

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium text-neutral-500">
        {label}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 flex w-full items-center justify-between rounded-md border border-neutral-200 px-2 py-1.5 text-left text-sm text-neutral-800"
        >
          <span className="truncate">{triggerText}</span>
          <span className="ml-1 shrink-0 text-neutral-400">▾</span>
        </button>
      </label>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
          {searchable && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="mb-2 w-full rounded border border-neutral-200 px-2 py-1 text-xs"
              autoFocus
            />
          )}
          {searchable && (
            <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-400">
              <span>
                All {label.toLowerCase()} / {filteredOptions.length} shown
              </span>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="font-medium text-green-600">
                  Show all
                </button>
              )}
            </div>
          )}
          {filteredOptions.length === 0 && <div className="px-1 py-2 text-xs text-neutral-400">No matches</div>}
          {filteredOptions.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
