import { useState } from 'react'

interface PhotoLightboxProps {
  urls: string[]
  initialIndex: number
  onClose: () => void
}

/** Full-screen photo viewer with prev/next — ports the pattern in
 * field_photo_viewer_screen.dart's _FullScreenPhotoViewer (browser
 * click-to-advance instead of Flutter's swipe gesture). */
export function PhotoLightbox({ urls, initialIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex)

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIndex((i) => (i - 1 + urls.length) % urls.length)
  }
  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIndex((i) => (i + 1) % urls.length)
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 text-xl text-white/80 hover:text-white">
        ✕
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
        {index + 1} / {urls.length}
      </div>

      {urls.length > 1 && (
        <button
          type="button"
          onClick={prev}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl text-white hover:bg-white/20"
        >
          ‹
        </button>
      )}

      <img src={urls[index]} alt="" className="max-h-[85vh] max-w-[90vw] object-contain" onClick={(e) => e.stopPropagation()} />

      {urls.length > 1 && (
        <button
          type="button"
          onClick={next}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl text-white hover:bg-white/20"
        >
          ›
        </button>
      )}
    </div>
  )
}
