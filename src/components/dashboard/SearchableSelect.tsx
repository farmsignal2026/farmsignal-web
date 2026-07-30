import { useEffect, useRef, useState } from 'react'

interface SearchableSelectProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
}

/** Single-value dropdown with a search box to filter a long option list —
 * used for Plot (400+ codes), where a plain <select> is unwieldy. Unlike
 * MultiSelectDropdown, selecting an option here closes the dropdown
 * (single-value, not checkbox multi-select). */
export function SearchableSelect({ label, value, options, onChange, placeholder = 'All' }: SearchableSelectProps) {
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

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))

  const select = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium text-neutral-500">
        {label}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 flex w-full items-center justify-between rounded-md border border-neutral-200 px-2 py-1.5 text-left text-sm text-neutral-800"
        >
          <span className="truncate">{value || placeholder}</span>
          <span className="ml-1 shrink-0 text-neutral-400">▾</span>
        </button>
      </label>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="mb-2 w-full rounded border border-neutral-200 px-2 py-1 text-xs"
            autoFocus
          />
          <button
            type="button"
            onClick={() => select('')}
            className={`block w-full rounded px-1 py-1 text-left text-xs hover:bg-neutral-50 ${!value ? 'font-semibold text-green-600' : 'text-neutral-700'}`}
          >
            {placeholder}
          </button>
          {filteredOptions.length === 0 && <div className="px-1 py-2 text-xs text-neutral-400">No matches</div>}
          {filteredOptions.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => select(o)}
              className={`block w-full rounded px-1 py-1 text-left text-xs hover:bg-neutral-50 ${o === value ? 'font-semibold text-green-600' : 'text-neutral-700'}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
