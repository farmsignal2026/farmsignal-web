import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { scopeFieldsForUser } from './fieldScoping'
import { FieldsRepository } from './fieldsRepository'
import type { Field, FieldGeo } from './types'

const fieldsRepository = new FieldsRepository(supabase)

/** Loads once per login, mirroring the Flutter `fieldsDataProvider`
 * (fields/application/fields_controller.dart) — TanStack Query caches by
 * the authed officer's id, so re-mounts don't refetch, and a future
 * mutation (e.g. a GeoTag save) can call `queryClient.invalidateQueries`. */
export function useFieldsData() {
  const { user, status } = useAuth()

  return useQuery({
    queryKey: ['fields-data', user?.officerId ?? user?.username ?? null],
    queryFn: () => fieldsRepository.loadFieldData(),
    enabled: status === 'authed' && user !== null,
    staleTime: Infinity,
  })
}

/** Role/division-scoped subset the rest of the app reads — ports
 * `fields = getScopedFields()`. */
export function useScopedFields(): Field[] {
  const { user } = useAuth()
  const { data } = useFieldsData()

  return useMemo(() => {
    if (!data || !user) return []
    return scopeFieldsForUser(data.fields, user)
  }, [data, user])
}

/** Geo data for the role/division-scoped fields only — must mirror
 * [useScopedFields]'s membership, not the full unscoped dataset. */
export function useGeoByCode(): Record<string, FieldGeo> {
  const { data } = useFieldsData()
  const scopedFields = useScopedFields()

  return useMemo(() => {
    if (!data) return {}
    const scopedCodes = new Set(scopedFields.map((f) => f.code))
    const result: Record<string, FieldGeo> = {}
    for (const g of data.geoData) {
      if (scopedCodes.has(g.code)) result[g.code] = g
    }
    return result
  }, [data, scopedFields])
}
