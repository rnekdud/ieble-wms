import defaultPolicy from '../../shared/billing-preview-policy.json' with { type: 'json' }
export type PricingPolicy = { monthlyPerUserKrw: number; annualDiscountPercent: number; eventEnabled: boolean; eventMonthlyPerUserKrw: number; eventEndsOn: string | null }
export type PricingPreview = { policy: PricingPolicy; asOf: string; eventEndsAt: string | null; eventActive: boolean; currentUsers: number; monthlyUnitKrw: number; annualUnitKrw: number; monthlyTotalKrw: number; annualTotalKrw: number }
export const billingPreviewPolicy: PricingPolicy = defaultPolicy
export function eventEndTime(policy: PricingPolicy) {
  return policy.eventEndsOn ? Date.parse(`${policy.eventEndsOn}T00:00:00+09:00`) + 86400000 : null
}
// With a dated event, a server time is required. Never decide expiry from the device clock.
export function pricingEstimate(users: number, policy: PricingPolicy = billingPreviewPolicy, serverNow: number | null = null) {
  const end = eventEndTime(policy)
  const known = !policy.eventEnabled || end === null || (serverNow !== null && Number.isFinite(serverNow) && Number.isFinite(end))
  const eventActive = policy.eventEnabled && known && (end === null || serverNow! < end)
  const annualMonthly = Math.floor(policy.monthlyPerUserKrw * (100 - policy.annualDiscountPercent) / 100)
  const monthlyUnit = eventActive ? policy.eventMonthlyPerUserKrw : policy.monthlyPerUserKrw
  const annualUnit = (eventActive ? policy.eventMonthlyPerUserKrw : annualMonthly) * 12
  return { known, eventActive, annualMonthly, monthlyUnit, annualUnit, monthlyTotal: users * monthlyUnit, annualTotal: users * annualUnit }
}
