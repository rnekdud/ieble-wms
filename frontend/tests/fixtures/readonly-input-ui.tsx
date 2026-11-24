import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReadOnlyInput from '../../src/components/ReadOnlyInput'
import '../../src/index.css'
import '../../src/business-ui.css'

function Fixture() {
  const [locked, setLocked] = useState(true), [busy, setBusy] = useState(false), [company, setCompany] = useState('기존 업체')
  return <main className="workspace-content">
    <button onClick={() => setLocked(v => !v)}>수정 허용 전환</button>
    <button onClick={() => setBusy(v => !v)}>처리 중 전환</button>
    <button onClick={() => setCompany('조회된 업체')}>조회 결과 반영</button>
    <form id="fixed-value-form"><fieldset disabled={busy}>
      <label>앞 필드<input name="before" defaultValue="앞" /></label>
      <label>소속 업체명<ReadOnlyInput name="companyName" value={company} readOnly={locked} onChange={e => setCompany(e.target.value)} /></label>
      <label>뒤 필드<input name="after" defaultValue="뒤" /></label>
      <ReadOnlyInput aria-label="기존 비활성 필드" name="excluded" disabled value="제외" />
    </fieldset></form>
    <ReadOnlyInput aria-label="폼 외부 고정값" form="fixed-value-form" name="external" value="연결값" />
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
