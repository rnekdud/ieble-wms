import { serviceTerms } from './service-terms'
import { privacyCollection } from './privacy-collection'
import { privacyPolicy } from './privacy-policy'

// Document content and provisional details are supplied by the operator.
export const signupLegalVersion = '2026-11-16-draft'
export const signupLegalDraftNotice = '검토용 초안입니다. 정식 운영 전 문구와 개인정보 보유 기간·문의처·위탁 현황을 확정해야 합니다.'
export type SignupLegalDocument = 'terms' | 'collection' | 'privacy'
type Section = { title: string; paragraphs: string[] }
export const signupLegalDocuments: Record<SignupLegalDocument, { title: string; draft: boolean; version: string; effectiveDate?: string; introduction?: string; sections: Section[] }> = {
  terms: serviceTerms,
  collection: privacyCollection,
  privacy: privacyPolicy,
}
