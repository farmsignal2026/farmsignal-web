import { useState } from 'react'
import { PhotoLightbox } from './PhotoLightbox'

interface PhotoGridProps {
  urls: string[]
  emptyText?: string
}

/** Read-only thumbnail grid + click-to-open lightbox — shared by Scout/
 * Follow-up inline photos and the Geotag section. Ports the 3-up grid in
 * scout_photo_grid.dart, generalized to any photo count (Geotag isn't
 * capped at 3 the way a single scout visit's photo slots are). */
export function PhotoGrid({ urls, emptyText = 'No photos yet.' }: PhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (urls.length === 0) {
    return <div className="text-[10px] text-neutral-400">{emptyText}</div>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="aspect-square overflow-hidden rounded-md border border-neutral-100"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox urls={urls} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  )
}
