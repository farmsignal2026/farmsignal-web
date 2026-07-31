/** Shared Excel/PDF/PNG export trio — used by Compare and Scout Analytics.
 * `showPNG=false` for table-based views (e.g. Compare's Stage Matrix) where
 * there's no canvas to rasterize, matching source's own
 * `compareExportPNG()` behavior of disabling PNG for the matrix view. */
export function ExportButtonRow({
  onPNG,
  onPDF,
  onExcel,
  showPNG = true,
}: {
  onPNG: () => void
  onPDF: () => void
  onExcel: () => void
  showPNG?: boolean
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onExcel}
        className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
      >
        ⬇ Excel
      </button>
      <button
        type="button"
        onClick={onPDF}
        className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
      >
        ⬇ PDF
      </button>
      {showPNG && (
        <button
          type="button"
          onClick={onPNG}
          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
        >
          ⬇ PNG
        </button>
      )}
    </div>
  )
}
