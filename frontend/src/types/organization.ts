export type Employee = {
  departmentId: string | null
  positionId: string | null
  departmentName: string | null
  positionName: string | null
  userId: string
  name: string
  loginId: string
  email: string
  role: string
  isActive: boolean
  membershipIsActive: boolean
  accountIsActive: boolean
  registeredAt: string
  lastLoginAt: string | null
  billingStartsAt: string
  billingStartMonth: string
  billingEndsAt: string | null
  deactivatedAt: string | null
  mustChangePassword: boolean
  version: string
}
export type EmployeeList = {
  items: Employee[]
  total: number
  page: number
  pageSize: number
  monthlyPerUserKrw: number
  billMasterAccounts: boolean
  billingTerminationPolicy: string
}
export type EmployeeCredentialResult = { user: Employee }
