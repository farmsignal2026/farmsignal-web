import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { ScoutRepository } from './scoutRepository'

const scoutRepository = new ScoutRepository(supabase)

/** Loads once per login, same pattern as useFieldsData.ts — scout_reports/
 * scout_followups aren't scoped to the currently-open field, so there's no
 * benefit to lazy per-field loading the way Geotag photos get (usePhotos.ts).
 * `refetchOnWindowFocus: 'always'` — see useFieldsData.ts's docstring, same
 * "refresh when you return to the tab" behavior for a scout visit someone
 * else just logged. */
export function useScoutData() {
  const { user, status } = useAuth()

  return useQuery({
    queryKey: ['scout-data', user?.officerId ?? user?.username ?? null],
    queryFn: () => scoutRepository.loadAll(),
    enabled: status === 'authed' && user !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  })
}
