import { t as uiText } from '../../i18n.ts'
import { useMobile } from '../../use-mobile'
import FormLabel from '../FormLabel'
import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { api } from '../../api'
import OrganizationDialog from './OrganizationDialog'
import { importErrors, importFailure, importReview } from '../../product-import-model'
import type { ImportReview as Review } from '../../product-import-model'
export default function ProductImportDialog({ endpoint, onClose, onImported }: { endpoint: string; onClose: () => void; onImported: (count: number) => void }) {
  const mobile = useMobile()
  const [request, setRequest] = useState<{requestId: string; fileBase64: string} | null>(null)
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const resultArea = useRef<HTMLElement>(null), fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!review && !error) return
    const frame = requestAnimationFrame(() => {
      resultArea.current?.scrollIntoView({ block: 'start' })
      resultArea.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [review, error])
  function showFailure(e: unknown, previous?: Review | null) {
    const failure = importFailure(e, previous)
    if (failure.review) setReview(failure.review)
    setError(failure.message)
  }
  const inFlight = useRef(false), downloadingRef = useRef(false)
  const [downloading, setDownloading] = useState(false), [fileName, setFileName] = useState(''), [dragging, setDragging] = useState(false)
  async function download() {
    if (downloadingRef.current) return
    downloadingRef.current = true; setDownloading(true); setError('')
    try {
      const response = await fetch(endpoint + '/import-template', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || '양식을 다운로드하지 못했습니다. 로그인 상태와 등록 권한을 확인해 주세요.')
      }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
      link.href = url; link.download = '아이블WMS_상품대량등록_양식.xlsx'; document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : '양식을 다운로드하지 못했습니다.') }
    finally { downloadingRef.current = false; setDownloading(false) }
  }
  async function upload(file?: File) {
    if (!file || inFlight.current) return
    setReview(null); setRequest(null); setError(''); setFileName(file.name)
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5000000 || file.size === 0) {
      setReview(importErrors([{ row: 0, column: '파일', value: file.name, message: file.size === 0 ? '빈 파일입니다. 상품을 작성한 .xlsx 파일을 선택해 주세요.' : '5MB 이내의 .xlsx 파일을 선택해 주세요.' }])); return
    }
    inFlight.current = true; setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let text = ''
      for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
      const body = { requestId: crypto.randomUUID(), fileBase64: btoa(text) }
      const result = importReview(await api<unknown>(endpoint + '/import-preview', body))
      if (!result) throw new Error('Invalid import response')
      setRequest(body); setReview(result)
    } catch (e) { showFailure(e) }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function commit() {
    if (!request || !review || !review.total || review.committed || review.errors.length || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = importReview(await api<unknown>(endpoint + '/import', request))
      if (!result) throw new Error('Invalid import response')
      setReview(result); if (result.committed) onImported(result.total)
    } catch (e) { showFailure(e, review) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const invalid = review ? (review.invalid ?? new Set(review.errors.filter(e => e.row > 1).map(e => e.row)).size) : 0
  const valid = review ? (review.valid ?? Math.max(0, review.total - invalid)) : 0
  return <OrganizationDialog title={uiText("상품 엑셀 대량등록")} size="large" busy={busy} onClose={onClose}>
    <div className="product-import-dialog"><div className="product-import-scroll">
      <section className="product-import-step" aria-labelledby="product-import-download">
        <h3 id="product-import-download">{uiText("① 엑셀 양식 다운로드")}</h3>
        <a className="secondary product-import-download" href={endpoint + '/import-template'} download="아이블WMS_상품대량등록_양식.xlsx" aria-disabled={downloading} onClick={e => { e.preventDefault(); void download() }}><Download size={18} aria-hidden="true"/>{downloading ? uiText("양식 준비 중…") : mobile ? uiText("엑셀 양식") : uiText("엑셀 양식 다운로드")}</a>
        <p>{uiText("상품 등록 · 작성 안내 · 선택값 안내 시트가 포함됩니다. 현재 기업의 분류를 선택할 수 있습니다.")}</p>
        <p>{uiText("최대 500개 상품 · 상품명 필수 · 상품코드 공란 시 자동 생성 · 재고는 별도 입고")}</p>
      </section>
      <section className="product-import-step" aria-labelledby="product-import-upload">
        <h3 id="product-import-upload">{uiText("② 작성한 엑셀 업로드")}</h3>
        <label className={`product-import-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (busy) return; if (e.dataTransfer.files.length !== 1) { setRequest(null); setFileName(''); setError(''); setReview(importErrors([{row: 0, column: '파일', value: '', message: '파일을 한 개씩 업로드해 주세요.'}])); return }; void upload(e.dataTransfer.files[0]) }}>
          <span><Upload size={20} aria-hidden="true"/><FormLabel required={!request}>{uiText("파일을 선택하거나 끌어다 놓으세요")}</FormLabel></span>
          <small>{uiText(".xlsx · 최대 5MB · 바코드는 텍스트 형식으로 입력")}</small>
          <input aria-required={!request} ref={fileInput} aria-label={uiText("상품 등록 파일")} type="file" accept=".xlsx" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }}/>
          {fileName && <strong>{fileName}</strong>}
        </label>
      </section>
      <section className="product-import-result" ref={resultArea} tabIndex={-1} aria-label={uiText("업로드 검증 결과")}>
        <h3>{uiText("③ 업로드 검증 결과")}</h3>
        {!review && !busy && !error && <p>{uiText("작성한 파일을 업로드하면 정상·오류 건수와 수정할 항목을 확인할 수 있습니다.")}</p>}
        {error && <p className="alert error" role="alert">{uiText(error)}{request && review && !review.errors.length ? uiText("등록 여부를 확인하려면 같은 요청으로 다시 시도해 주세요.") : ''}</p>}
        {busy && <p role="status">{review ? uiText("등록 중…") : uiText("파일 검증 중…")}</p>}
        {review && <>
          <p className="product-import-summary" role="status">{uiText("전체")} {review.total}{uiText("건 / 정상")} {valid}{uiText("건 / 오류")} {review.errors.length}{uiText("건")}{review.errors.length ? uiText("· 파일 수정 후 재업로드해 주세요.") : uiText("· 확인 후 최종 등록하세요.")}</p>
          {review.errors.length > 0 ? <>
            <h4>{uiText("오류 내역 (")}{review.errors.length}{uiText("건)")}</h4>
            {review.total > 0 && <p>{uiText("오류 상품")} {invalid}{uiText("건 · 한 상품에 여러 오류가 있을 수 있습니다. 모든 오류를 수정해야 일괄등록할 수 있습니다.")}</p>}
            <div className="table-scroll product-import-errors" tabIndex={0} role="region" aria-label={uiText("오류 내역")}>
              <table className="organization-table"><thead><tr>{['엑셀 행', '상품명 / 상품코드', '오류 항목', '입력값', '오류 원인'].map(x => <th key={x} scope="col">{uiText(x)}</th>)}</tr></thead><tbody>
                {review.errors.map((e, i) => {
                  const row = review.rows.find(r => r.row === e.row)
                  return <tr key={i}><td>{e.row > 0 ? uiText("{v0}행", { v0: e.row }) : uiText("파일 전체")}</td><td>{e.productName || row?.name || e.productCode || row?.code || '—'}</td><td>{e.column}</td><td>{e.value || uiText("(빈 값)")}</td><td>{uiText(e.message)}</td></tr>
                })}
              </tbody></table>
            </div>
          </> : <details open><summary>{uiText("등록 예정 상품 확인")}</summary><div className="table-scroll"><table className="organization-table"><thead><tr>{['엑셀 행','상품명','상품코드','인박스 수량','아웃박스 수량','아웃박스 EA','파레트당 아웃박스'].map(x => <th key={x}>{uiText(x)}</th>)}</tr></thead><tbody>{review.rows.map(r => <tr key={r.row}><td>{r.row}{uiText("행")}</td><td>{r.name}</td><td>{r.code || uiText("자동 생성")}</td><td>{r.innerPackQuantity ?? '—'}</td><td>{r.outerPackQuantity ?? '—'}</td><td>{r.outerPackQuantity ? r.outerPackQuantity * (r.outerPackUnit === 'EA' ? 1 : r.innerPackQuantity || 0) : '—'}</td><td>{r.palletPackQuantity ?? '—'}</td></tr>)}</tbody></table></div></details>}
        </>}
      </section>
    </div><div className="dialog-actions">{(review || error) && <button className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{uiText("파일 다시 선택")}</button>}<button className="secondary" disabled={busy} onClick={onClose}>{uiText("취소")}</button><button className="primary" disabled={busy || !review || !!review.errors.length || review.total === 0 || review.committed} onClick={() => void commit()}>{uiText("최종 일괄등록")}</button></div></div>
  </OrganizationDialog>
}
