export const tenantStatuses: Record<string, string> = {
  Active: '등록',
  Suspended: '이용정지',
}
export const historicalTenantStatuses: Record<string, string> = {
  ...tenantStatuses,
  PendingActivation: '이전 승인 대기',
  Rejected: '이전 반려',
}
export const billingStatuses: Record<string, string> = {
  CardRequired: '카드 등록 필요',
  PaymentRequired: '카드 등록 완료',
  Paid: '결제 완료',
}
