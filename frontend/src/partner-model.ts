export const partnerTypes = { SUPPLIER: '매입처', CUSTOMER: '매출처', BOTH: '매입·매출처' } as const
export const partnerTextFields = [
  ['code', '거래처코드', 64], ['name', '거래처명', 200],
  ['businessRegistrationNumber', '사업자등록번호', 64], ['representativeName', '대표자명', 100],
  ['postalCode', '우편번호', 20], ['address', '주소', 500], ['addressDetail', '상세주소', 500],
  ['defaultShippingPostalCode', '기본 출고지 우편번호', 20], ['defaultShippingAddress', '기본 출고지 기본주소', 500], ['defaultShippingAddressDetail', '기본 출고지 상세주소', 500],
  ['phone', '대표 전화번호', 50], ['email', '이메일', 254], ['contactName', '담당자명', 100],
  ['contactPhone', '담당자 연락처', 50], ['paymentTerms', '결제조건', 500], ['notes', '비고', 2000],
] as const
export type PartnerTextKey = typeof partnerTextFields[number][0]
export type Partner = Record<PartnerTextKey, string | null> & {
  id: string; code: string; name: string; type: keyof typeof partnerTypes; registrationCountry: 'KR' | 'OTHER'
  isActive: boolean; version: string; createdAt: string; updatedAt: string
  createdByUserId: string | null; updatedByUserId: string | null
}
export type PartnerDraft = Record<PartnerTextKey, string> & Pick<Partner, 'type' | 'registrationCountry' | 'isActive'>
export type PartnerList = { items: Partner[]; total: number; page: number; pageSize: number }
export type PartnerSave = { partner: Partner; warning: string | null }
export function partnerDraft(p?: Partner): PartnerDraft {
  const text = Object.fromEntries(partnerTextFields.map(([key]) => [key, p?.[key] || ''])) as Record<PartnerTextKey, string>
  return { ...text, type: p?.type || 'SUPPLIER', registrationCountry: p?.registrationCountry || 'KR', isActive: p?.isActive ?? true }
}
export function businessNumberError(value: string, country: Partner['registrationCountry']) {
  if (!value.trim()) return null
  const compact = value.replace(/[\s-]/g, '')
  if (country === 'KR' && !/^[0-9]{10}$/.test(compact)) return '국내 사업자등록번호는 하이픈을 제외한 숫자 10자리로 입력해 주세요.'
  if (!compact) return '사업자등록번호를 확인해 주세요.'
  return null
}
export function partnerError(d: PartnerDraft) {
  if (!d.name.trim()) return '거래처명을 입력해 주세요.'
  if (d.code.trim().normalize('NFKC').length > 64 || Array.from(d.code.trim()).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159)) return '거래처코드 입력 형식을 확인해 주세요. 최대 64자입니다.'
  const numberError = businessNumberError(d.businessRegistrationNumber, d.registrationCountry)
  if (numberError) return numberError
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(d.email.trim())) return '이메일 형식을 확인해 주세요.'
  for (const key of ['phone', 'contactPhone'] as const) {
    const value = d[key].trim()
    if (value && (!/^[0-9+().\- ]+$/.test(value) || !/[0-9]/.test(value))) return '전화번호는 숫자와 +, -, 공백, 괄호 등으로 입력해 주세요.'
  }
  return null
}
export function partnerRequest(d: PartnerDraft, requestId: string, p?: Partner) {
  const text = Object.fromEntries(partnerTextFields.map(([key]) => [key, d[key].trim() || null]))
  return { ...d, ...text, defaultShippingPostalCode: d.defaultShippingPostalCode.trim() || (p?.defaultShippingPostalCode ? '' : undefined), defaultShippingAddress: d.defaultShippingAddress.trim() || (p?.defaultShippingAddress ? '' : undefined), defaultShippingAddressDetail: d.defaultShippingAddressDetail.trim() || (p?.defaultShippingAddressDetail ? '' : undefined), requestId, version: p?.version || '00000000-0000-0000-0000-000000000000' }
}
export function partnerDirty(d: PartnerDraft, initial: PartnerDraft) {
  return JSON.stringify(partnerRequest(d, '')) !== JSON.stringify(partnerRequest(initial, ''))
}
