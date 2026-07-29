import type { Role } from './types'

/** Ports `roleToLabel()` (000_A_FarmSignal_APP_new.html:2088-2114 /
 * farmsignal_flutter role_access.dart). */
export function roleToLabel(role: Role, factoryCode: string | null): string {
  switch (role) {
    case 'admin':
      return 'Administrator'
    case 'manager':
      return factoryCode ? `Super User · ${factoryCode}` : 'Executive View'
    case 'officer':
      return 'Field Officer'
    case 'viewer':
      return 'Viewer'
    default:
      return role
  }
}
