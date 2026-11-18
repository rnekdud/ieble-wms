import { useEffect, useRef, useState } from 'react'
import OrganizationDialog from './workspace/OrganizationDialog'
import { signupLegalDocuments, signupLegalDraftNotice, type SignupLegalDocument } from '../signup-legal'
import './registration-agreements.css'

export default function RegistrationAgreements() {
  const [terms, setTerms] = useState(false), [collection, setCollection] = useState(false)
  const [document, setDocument] = useState<SignupLegalDocument | null>(null)
  const all = useRef<HTMLInputElement>(null)
  useEffect(() => { if (all.current) all.current.indeterminate = terms !== collection }, [terms, collection])
  const content = document ? signupLegalDocuments[document] : null
  return <section className="registration-agreements" aria-labelledby="registration-agreements-title">
    <h2 id="registration-agreements-title">약관 및 개인정보 안내</h2>
    <p className="registration-legal-draft">서비스 이용약관 시행일: {signupLegalDocuments.terms.effectiveDate}<br />개인정보처리방침 시행일: {signupLegalDocuments.privacy.effectiveDate}</p>
    <label className="registration-agree-all"><input ref={all} type="checkbox" checked={terms && collection} onChange={e => { setTerms(e.target.checked); setCollection(e.target.checked) }} />필수 항목에 모두 동의합니다</label>
    <div className="registration-agree-row"><label><input type="checkbox" name="termsConsent" required checked={terms} onChange={e => setTerms(e.target.checked)} /><span>서비스 이용약관 동의 <strong>(필수)</strong></span></label><button type="button" onClick={() => setDocument('terms')} aria-label="서비스 이용약관 보기">보기</button></div>
    <div className="registration-agree-row"><label><input type="checkbox" name="privacyConsent" required checked={collection} onChange={e => setCollection(e.target.checked)} /><span>개인정보 수집·이용 동의 <strong>(필수)</strong></span></label><button type="button" onClick={() => setDocument('collection')} aria-label="개인정보 수집·이용 안내 보기">보기</button></div>
    <button type="button" className="registration-privacy-link" onClick={() => setDocument('privacy')}>개인정보처리방침 보기</button>
    {content && <OrganizationDialog title={content.title} className="registration-legal-dialog" size="large" onClose={() => setDocument(null)} actions={<button type="button" className="secondary" onClick={() => setDocument(null)}>닫기</button>}>
      <article className="registration-legal-document">{content.draft && <p className="registration-legal-notice">{signupLegalDraftNotice}</p>}{(content.draft || content.effectiveDate) && <p className="registration-legal-version">{content.draft ? `초안 버전: ${content.version}` : `시행일: ${content.effectiveDate}`}</p>}{content.introduction?.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}{content.sections.map(section => <section key={section.title}><h3>{section.title}</h3>{section.paragraphs.map(text => <LegalParagraph key={text} text={text} />)}</section>)}</article>
    </OrganizationDialog>}
  </section>
}

function LegalParagraph({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : part)
  const lines = text.split('\n')
  if (text.startsWith('### ')) return <h4>{inline(text.slice(4))}</h4>
  if (lines.length >= 3 && lines.every(line => line.startsWith('|') && line.endsWith('|')) && /^\|[-:| ]+\|$/.test(lines[1])) {
    const cells = (line: string) => line.slice(1, -1).split('|').map(cell => cell.trim())
    const headings = cells(lines[0])
    return <table className="registration-legal-table" aria-label={headings[0] === '보관 항목' ? '관계 법령에 따른 보관기간' : '처리위탁 현황'} data-wide-value={headings[1] !== '보관기간'}><thead><tr>{headings.map(heading => <th key={heading} scope="col">{inline(heading)}</th>)}</tr></thead><tbody>{lines.slice(2).map(line => <tr key={line}>{cells(line).map((cell, index) => <td key={index}>{inline(cell)}</td>)}</tr>)}</tbody></table>
  }
  if (lines.every(line => /^\d+\. /.test(line))) return <ol>{lines.map(line => <li key={line}>{inline(line.replace(/^\d+\. /, ''))}</li>)}</ol>
  if (lines.every(line => line.startsWith('- '))) return <ul>{lines.map(line => <li key={line}>{inline(line.slice(2))}</li>)}</ul>
  return <p>{inline(text)}</p>
}
