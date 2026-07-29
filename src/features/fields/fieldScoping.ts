import type { AppUser } from '../auth/types'
import type { Field } from './types'

/** Ports `scopeFieldsForUser` (farmsignal_flutter/lib/features/fields/domain/
 * field_scoping.dart), itself a port of `getScopedFields()`
 * (000_A_FarmSignal_APP_new.html:2376-2431). */
export function scopeFieldsForUser(allFields: Field[], user: AppUser): Field[] {
  const divisionCodes = new Set(user.divisionCodes.map((d) => d.toUpperCase()))

  const byDivision = (src: Field[]): Field[] => {
    if (divisionCodes.size === 0) return src
    return src.filter((f) => divisionCodes.has(f.divisionCode.toUpperCase()))
  }

  switch (user.role) {
    case 'admin':
      if (!user.clientCode) return allFields
      return allFields.filter((f) => (f.clientCode ?? '') === user.clientCode)

    case 'manager': {
      if (!user.factoryCode) {
        if (user.clientCode) {
          return allFields.filter((f) => (f.clientCode ?? '') === user.clientCode)
        }
        return allFields
      }
      const byFactory = allFields.filter((f) => f.factoryCode === user.factoryCode)
      return byDivision(byFactory)
    }

    case 'officer':
    case 'viewer': {
      let src = allFields
      if (user.factoryCode) {
        src = src.filter((f) => f.factoryCode === user.factoryCode)
      } else if (user.clientCode) {
        src = src.filter((f) => (f.clientCode ?? '') === user.clientCode)
      }
      return byDivision(src)
    }

    default:
      return allFields
  }
}
