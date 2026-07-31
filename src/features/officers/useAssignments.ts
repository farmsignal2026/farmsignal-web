import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import { OfficersRepository } from './officersRepository'

const officersRepository = new OfficersRepository(supabase)

/** Open scout-assignment alerts — deliberately NOT `staleTime: Infinity`
 * like the other once-per-login hooks (useScoutData/useOfficers): this
 * list needs to reflect a just-made assignment or a just-cancelled one
 * within the same session, so ManageAssignmentsModal refetches it on
 * every open instead of trusting a stale cache. */
export function useAssignments(enabled: boolean) {
  const { user, status } = useAuth()

  return useQuery({
    queryKey: ['open-assignments', user?.officerId ?? user?.username ?? null],
    queryFn: () => officersRepository.loadOpenAssignments(),
    enabled: enabled && status === 'authed' && user !== null,
  })
}
