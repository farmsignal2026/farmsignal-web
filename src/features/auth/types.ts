export type Role = 'admin' | 'manager' | 'officer' | 'viewer'

export interface AppUser {
  username: string
  name: string
  officerId: string | null
  role: Role
  roleLabel: string
  factoryCode: string | null
  factoryName: string | null
  clientCode: string | null
  divisionCode: string | null
  divisionCodes: string[]
}

export interface OfficerProfile {
  id: string
  name: string
  role: Role
  factoryCode: string | null
  factoryName: string | null
  clientCode: string | null
  divisionCode: string | null
  divisionCodes: string[]
}

export class AppAuthError extends Error {}
