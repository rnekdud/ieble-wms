import { useMobile } from '../../use-mobile'
import FormLabel from '../FormLabel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import type { Choice } from '../../receipt-model'
import { exactProduct, pastedQuantityError, parseProductPaste, productMatchKey, productMatchUrl } from '../../document-paste'
import type { ImportedProduct, PasteRow, ProductChoices } from '../../document-paste'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import './document-paste.css'

type Match = { items: Choice[]; total: number; error: string }
export default function DocumentPasteDialog({ endpoint, quantityLabel, capacity, onAdd, onClose }: {
  endpoint: string; quantityLabel: '예정 수량' | '요청 수량'; capacity: number; onAdd: (products: ImportedProduct[]) => void; onClose: () => void
}) {
  const mobile = useMobile()
  const [text, setText] = useState(''), [revision, setRevision] = useState(0), [downloadError, setDownloadError] = useState('')
  const [matches, setMatches] = useState<{ source: string; revision: number; values: Record<string, Match> } | null>(null)
  const [chosen, setChosen] = useState<Record<number, Choice>>({}), [choosing, setChoosing] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false), submitted = useRef(false), input = useRef<HTMLTextAreaElement>(null)
  const parsed = useMemo(() => parseProductPaste(text, quantityLabel), [text, quantityLabel])
  const current = matches?.source === text && matches.revision === revision ? matches.values : null
  const loading = !parsed.error && parsed.rows.some(row => !row.error) && !current
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (parsed.error || !parsed.rows.some(row => !row.error)) return
    let live = true
    const timer = setTimeout(() => {
      const unique = [...new Map(parsed.rows.filter(row => !row.error).map(row => [productMatchKey(row), row])).values()]
      let next = 0
      const values: Record<string, Match> = Object.create(null)
      async function worker() {
        while (live && next < unique.length) {
          const row = unique[next++], key = productMatchKey(row)
          try {
            const result = await api<ProductChoices>(productMatchUrl(endpoint, row))
            if (!live) return
            if (result.total > 0) values[key] = { items: result.items.filter(product => exactProduct(row, product)), total: result.total, error: '' }
            else values[key] = { items: [], total: 0, error: '등록되지 않은 상품입니다. 사용 중지 여부도 확인하세요.' }
          } catch (e) { values[key] = { items: [], total: 0, error: e instanceof Error ? `조회 실패: ${e.message}` : '조회 실패: 다시 조회해 주세요.' } }
        }
      }
      void Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker)).then(() => { if (live) setMatches({ source: text, revision, values }) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [endpoint, text, parsed, revision])
  const resolved = parsed.rows.map(row => {
    const match = current?.[productMatchKey(row)]
    const product = row.error || match?.error ? undefined : match?.total === 1 ? match.items[0] : match && chosen[row.row]
    const selected = exactProduct(row, product) ? product : undefined
    return { row, match, product: selected, error: row.error || match?.error || (selected ? pastedQuantityError(row.quantity, selected) : '') }
  })
  const valid = resolved.filter(r => !!r.product && !r.error).length
  const errors = resolved.filter(r => !!r.error).length
  const ambiguous = resolved.filter(r => !r.error && !r.product && !!r.match && !r.match.error && r.match.total > 1).length
  const capacityError = parsed.rows.length > capacity ? `현재 목록에는 ${capacity}행까지 추가할 수 있습니다. 한 번에 추가할 행 수를 확인해 주세요.` : ''
  const canAdd = !loading && !parsed.error && !capacityError && valid > 0 && valid === parsed.rows.length
  async function download() {
    setDownloading(true); setDownloadError('')
    try {
      const response = await fetch(`${endpoint}/paste-template`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error('양식을 다운로드하지 못했습니다. 권한·연결을 확인하고 다시 시도하세요.')
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${quantityLabel === '예정 수량' ? '입고' : '출고'}_엑셀_붙여넣기.xlsx`; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setDownloadError(e instanceof Error ? e.message : '다운로드에 실패했습니다.') }
    finally { setDownloading(false) }
  }
  return <OrganizationDialog title="엑셀 붙여넣기" className="document-paste-dialog" size="large" onClose={onClose} actions={<><button type="button" className="secondary" onClick={onClose}>취소</button><button type="button" className="primary" disabled={!canAdd} onClick={() => { if (!canAdd || submitted.current) return; submitted.current = true; onAdd(resolved.map(({ row, product }) => ({ product: product!, quantity: row.quantity }))) }}>추가</button></>}>
    <div className="document-paste">
      <div className="document-paste-guide"><p><strong>상품명 | {quantityLabel}</strong><br />Excel의 2개 열을 복사해 아래에 붙여넣으세요. 제목 행도 포함할 수 있습니다.</p><button type="button" className="secondary" disabled={downloading} onClick={() => void download()}>{downloading ? (mobile ? '준비 중…' : '다운로드 중…') : mobile ? '엑셀 양식' : '엑셀 양식 다운로드'}</button></div>
      <label><FormLabel required>붙여넣기 입력</FormLabel><textarea aria-required="true" ref={input} aria-label="엑셀 붙여넣기 입력" rows={5} value={text} spellCheck={false} placeholder={`상품명\t${quantityLabel}\n사탕\t20\n밀가루\t5.5`} onChange={e => { setText(e.target.value); setChosen({}); setChoosing(null) }} /></label>
      <details className="document-paste-help"><summary>붙여넣기 안내 · 최대 {capacity}행</summary><p className="organization-help">단위는 상품 정보에서 자동으로 적용됩니다. Ctrl+V, Command+V 또는 기기의 붙여넣기를 사용하세요.</p><p className="organization-help">한 번에 최대 {capacity}행 · 반복 추가 가능 · 개수 단위는 정수, 계량 단위는 소수점 3자리까지 입력하세요.</p><p className="organization-help">[추가]는 현재 작성 중인 목록만 변경하며, 문서 등록·재고 예약은 하지 않습니다. LOT·유통기한·시리얼은 추가 후 기존 상품 행에서 입력하세요.</p></details>
      {(parsed.error || capacityError || downloadError) && <p className="alert error" role="alert">{parsed.error || capacityError || downloadError}</p>}
      <div className="document-paste-summary" role="status"><span>전체 {parsed.rows.length}행</span><strong>정상 {valid}건</strong><span>오류 {errors}건</span><span>선택 필요 {ambiguous}건</span>{loading && <span>상품 조회 중…</span>}<button type="button" className="secondary" disabled={!parsed.rows.length || loading} onClick={() => { setChosen({}); setChoosing(null); setRevision(v => v + 1) }}>상품 다시 조회</button></div>
      {!!parsed.rows.length && <div className="table-scroll document-paste-preview" role="region" aria-label="붙여넣기 미리보기"><table className="organization-table document-paste-table"><thead><tr>{['행', '상품명', '매칭 상품', quantityLabel, '상태'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{resolved.map(({ row, match, product, error }) => <tr key={row.row} data-state={error ? 'error' : product ? 'valid' : 'pending'}>
        <td data-label="행"><strong>{row.row}</strong></td><td data-label="상품명">{row.name || '—'}</td>
        <td data-label="매칭 상품">{product ? <>{product.name}<small>{product.code}{product.modelNumber ? ` · ${product.modelNumber}` : ''}</small></> : '—'}{!row.error && match && match.total > 1 && <button type="button" className="secondary" aria-label={`${row.row}행 상품 선택`} onClick={() => setChoosing(row.row)}>{product ? '선택 변경' : '상품 선택'}</button>}</td>
        <td data-label={quantityLabel}>{row.quantity || '—'}{product?.unit && product.unit !== 'EA' ? ` ${product.unit}` : ''}</td>
        <td data-label="상태">{error ? <span className="document-paste-error">오류 · {error}</span> : product ? <span className="document-paste-success">정상</span> : match && match.total > 1 ? <span>확인 필요 · 동일 상품명 {match.total}건 중 선택하세요.</span> : <span>상품 조회 중…</span>}</td>
      </tr>)}</tbody></table></div>}
      {choosing !== null && parsed.rows.find(row => row.row === choosing) && <ProductCandidates key={`${text}:${choosing}`} endpoint={endpoint} row={parsed.rows.find(row => row.row === choosing)!} selected={chosen[choosing]?.id} onSelect={product => { setChosen(v => ({ ...v, [choosing]: product })); setChoosing(null) }} />}
      <p className="organization-help">오류·선택 필요 항목을 해결하면 전체 행을 추가할 수 있습니다.</p>
    </div>
  </OrganizationDialog>
}

function ProductCandidates({ endpoint, row, selected, onSelect }: { endpoint: string; row: PasteRow; selected?: string; onSelect: (product: Choice) => void }) {
  const [page, setPage] = useState(1), [data, setData] = useState<{ url: string; result: ProductChoices } | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const root = useRef<HTMLElement>(null)
  useEffect(() => { root.current?.focus(); root.current?.scrollIntoView({ block: 'nearest' }) }, [])
  const url = productMatchUrl(endpoint, row, page), key = `${url}:${retry}`
  useEffect(() => { let live = true; api<ProductChoices>(url).then(result => { if (live) { setData({ url: key, result }); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [url, key])
  const ready = data?.url === key
  return <section ref={root} tabIndex={-1} className="document-paste-candidates" aria-label="중복 상품 선택"><h3>{row.row}행 · {row.name}</h3><p>상품코드·모델번호·기준 단위를 확인해 상품 하나를 선택하세요.</p>{error && <p role="alert">{error}<button type="button" className="secondary" onClick={() => setRetry(v => v + 1)}>다시 조회</button></p>}{!ready && !error && <p role="status">후보 조회 중…</p>}{ready && <>{data.result.items.filter(p => exactProduct(row, p)).map(product => <button key={product.id} type="button" className="secondary" aria-pressed={selected === product.id} onClick={() => onSelect(product)}>{product.code} · {product.name}{product.modelNumber ? ` · ${product.modelNumber}` : ''} · {product.unit}</button>)}{data.result.total === 0 && <p>사용 가능한 후보가 없습니다. 상품 다시 조회를 눌러 확인하세요.</p>}<Pagination page={page} pageSize={data.result.pageSize} total={data.result.total} onChange={setPage} label="중복 상품 후보 페이지" /></>}</section>
}
