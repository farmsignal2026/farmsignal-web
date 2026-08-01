import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { OfficersRepository } from './officersRepository'

const officersRepository = new OfficersRepository(supabase)

/** Loads once per login, same pattern as useScoutData.ts — the officer
 * list isn't scoped to any particular field, so there's no benefit to
 * lazy per-field loading. */
export function useOfficers() {
  const { user, status } = useAuth()

  return useQuery({
    queryKey: ['officers', user?.officerId ?? user?.username ?? null],
    queryFn: () => officersRepository.loadActive(),
    enabled: status === 'authed' && user !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: 'always',
  })
}
