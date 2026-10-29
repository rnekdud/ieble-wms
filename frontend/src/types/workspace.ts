export type Workspace = {
  id: string
  name: string
  businessRegistrationNumber: string | null
  role: string
  serviceStatus: string
  billingPolicyVersion?: number
  billingStatus: string
  billingAccess: {
    state: string
    canAccessWms: boolean
    hasRegisteredCard: boolean
    freeUntil: string
    firstChargeAt: string
  }
  billingPolicy: {
    monthlyPerUserKrw: number
    monthlyBaseKrw: number
    includedUsers: number
    billMasterAccounts: boolean
    registrationMonthFree: boolean
    newMembersStartFollowingMonth: boolean
    billingDayOfMonth: number
    timeZoneId: string
  }
  warehouseSetupPreview?: boolean
  billingProviderConfigured: boolean
  canManageBilling: boolean
  permissions: Record<string, string[]>
  latestChange: { reason: string; changedAt: string } | null
}
