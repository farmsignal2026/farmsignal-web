import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { PhotosRepository } from './photosRepository'

const photosRepository = new PhotosRepository(supabase)

/** Lazy per-field query — only fetched when a Field Detail modal is open
 * for a given plot, unlike scout data which loads once per login. Geotag
 * photos aren't needed for any aggregate/list view yet, so there's no
 * reason to preload them for all 400+ fields upfront. */
export function usePhotos(plotCode: string | null, source: string) {
  const { status } = useAuth()

  return useQuery({
    queryKey: ['field-photos', plotCode, source],
    queryFn: () => photosRepository.fetchPhotos(plotCode!, source),
    enabled: status === 'authed' && plotCode !== null,
    staleTime: Infinity,
  })
}
