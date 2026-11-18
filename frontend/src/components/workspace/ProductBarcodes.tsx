import { Trash2 } from 'lucide-react'
import FormLabel from '../FormLabel'
import BarcodePackagingInputs, { type BarcodePackagingDraft, type BarcodePackagingChange } from './BarcodePackagingInputs'
import { barcodePackageError, packageFactors, packageLabels, type Packaging, type PackageCode } from '../../product-packaging'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { api } from '../../api'
import type { BarcodeDraft } from '../../product-master-model'
import { barcodeError, barcodeInputValue } from '../../rack-barcode'
import BarcodeScanInput from './BarcodeScanInput'
import RackBarcodeFields from './RackBarcodeFields'
import RackBarcodeLabel from './RackBarcodeLabel'

type Check = { available: boolean; conflict?: { kind: 'product' | 'rack' | 'location'; id: string; code: string; name: string; warehouseName?: string } }

/** The input's native validity blocks the shared submit action, including pending/stale checks. */
function BarcodeRow({ packaging, packagingDraft, onPackagingChange, unit, row, index, duplicate, endpoint, productId, code, busy, update, select, primary, remove }: {
  packaging: Packaging; packagingDraft: BarcodePackagingDraft; onPackagingChange: BarcodePackagingChange; unit: string; row: BarcodeDraft; index: number; duplicate: boolean; endpoint: string; productId?: string; code: string; busy: boolean
  update: (patch: Partial<BarcodeDraft>) => void; select: () => void; primary: (checked: boolean) => void; remove: () => void
}) {
  const value = barcodeInputValue(row.change, row.current), id = useId()
  const [validationVisible, setValidationVisible] = useState(false)
  const showMessage = !!value || validationVisible
  const root = useRef<HTMLElement>(null), checkNow = useRef<() => void>(() => {})
  const [response, setResponse] = useState<{ key: string; data?: Check; error?: string } | null>(null)
  const key = JSON.stringify([endpoint, productId, value]), invalid = value ? barcodeError(value) : '바코드를 입력하거나 빈 행을 삭제해 주세요.'
  const result = response?.key === key ? response : null
  const conflict = result?.data?.conflict
  const message = duplicate ? '동일 상품에 같은 바코드를 두 번 등록할 수 없습니다.' : invalid || result?.error || (!result ? '바코드 중복 확인 중…' : result.data?.available ? '사용 가능한 바코드입니다.' : conflict ? conflict.kind === 'product' ? `이미 ${conflict.name}(${conflict.code}) 상품에 등록된 바코드입니다.` : `이미 ${conflict.kind === 'rack' ? '랙' : '보관 위치'} ${conflict.code}에 사용 중입니다. 창고: ${conflict.warehouseName}` : '사용할 수 없는 바코드입니다.')
  const packageProblem = barcodePackageError(packaging, unit, row.packageCode || 'EA')
  const packageSelect = useRef<HTMLSelectElement>(null)
  useLayoutEffect(() => { packageSelect.current?.setCustomValidity(packageProblem || '') }, [packageProblem])
  const blocked = duplicate || !!invalid || !result?.data?.available
  useEffect(() => {
    let active = true, running = false
    async function run() {
      if (invalid || duplicate || running) return
      running = true
      try {
        const query = new URLSearchParams({ value, ...(productId ? { productId } : {}) })
        const data = await api<Check>(endpoint.replace(/\/products$/, '/barcodes/check') + '?' + query)
        if (active) setResponse({ key, data })
      } catch { if (active) setResponse({ key, error: '중복 여부를 확인하지 못했습니다. 다시 확인해 주세요.' }) }
      finally { running = false }
    }
    const timer = window.setTimeout(() => void run(), row.change.mode === 'auto' ? 0 : 350)
    checkNow.current = () => { window.clearTimeout(timer); void run() }
    return () => { active = false; window.clearTimeout(timer); checkNow.current = () => {} }
  }, [key, endpoint, productId, value, invalid, duplicate, row.change.mode])
  useLayoutEffect(() => {
    const input = root.current?.querySelector<HTMLInputElement>('.rack-barcode-input-row input')
    if (input) { root.current?.querySelector('.registration-field-error')?.remove(); input.removeAttribute('aria-errormessage'); input.setCustomValidity(blocked ? message : ''); input.setAttribute('aria-invalid', String(showMessage && blocked && (!!result || !!invalid || duplicate))); input.setAttribute('aria-describedby', showMessage ? id : root.current?.querySelector('.rack-barcode-fields > small')?.id || '') }
  }, [blocked, message, result, invalid, duplicate, id, showMessage])
  return <section ref={root} className="product-barcode-row" aria-label={`바코드 ${index + 1} 영역`} onFocusCapture={select} onInvalidCapture={e => { if ((e.target as HTMLElement).matches('.rack-barcode-input-row input')) setValidationVisible(true) }}>
    <div className="product-barcode-heading"><strong>바코드 {index + 1}</strong><label className="products-checks"><input type="checkbox" checked={row.isPrimary} onChange={e => primary(e.target.checked)} />대표</label><button type="button" className="secondary product-barcode-delete" aria-label="바코드 삭제" onClick={remove}><Trash2 size={16} aria-hidden="true" /></button></div>
    <div className="product-barcode-entry">
      <label><FormLabel required>바코드 적용 단위</FormLabel><select aria-required="true" ref={packageSelect} aria-label={`바코드 ${index + 1} 포장 단위`} aria-invalid={!!packageProblem} aria-describedby={packageProblem ? `${id}-package` : undefined} value={row.packageCode || 'EA'} onChange={e => update({ packageCode: e.target.value })}>{Object.entries(packageLabels).map(([code, label]) => <option key={code} value={code} disabled={code !== 'EA' && unit !== 'EA'}>{code === 'EA' ? unit === 'EA' ? '낱개(EA)' : `기존 단위(${unit})` : label}</option>)}</select></label>
      <div className="product-barcode-factor"><span>환산 수량</span><output aria-label={`바코드 ${index + 1} 환산 수량`}>{packageProblem ? '설정 필요' : `${packageFactors(packaging)[(row.packageCode || 'EA') as PackageCode]?.toLocaleString('ko-KR')} ${unit}`}</output></div>
      {unit === 'EA' && <BarcodePackagingInputs key={row.packageCode || 'EA'} draft={packagingDraft} change={onPackagingChange} packageCode={row.packageCode || 'EA'} index={index} busy={busy} />}
      <div className="product-barcode-value-field" onBlurCapture={e => { if ((e.target as HTMLElement).matches('.rack-barcode-input-row input')) { setValidationVisible(true); checkNow.current() } }}>
        <RackBarcodeFields required inputOnly label={`상품 바코드 ${index + 1}`} kind="product" warehouseEndpoint={endpoint} candidateEndpoint={endpoint + '/barcode-candidates'} rackId={row.key} rackCode={code} current={row.current} value={row.change} disabled={busy} onChange={change => { setValidationVisible(true); select(); update({ change, ...(change.mode === 'auto' ? { barcodeType: 'Internal' } : {}) }) }} />
        {showMessage && <div id={id} className={`barcode-check ${blocked ? result?.error || conflict || duplicate || invalid || result?.data?.available === false ? 'error' : 'pending' : 'available'}`} aria-live="polite"><span>{message}</span>{conflict?.kind === 'product' && <a href={`/app/products/${conflict.id}`} target="_blank" rel="noopener noreferrer">상품 확인 ↗</a>}{result?.error && <button type="button" className="secondary" onClick={() => checkNow.current()}>다시 확인</button>}</div>}
      </div>
    </div>
    {packageProblem && <p id={`${id}-package`} className="barcode-check error" role="alert">{packageProblem}</p>}
    <div className="product-barcode-meta"><label>용도 (선택)<input maxLength={200} placeholder="제조사·포장 등" value={row.description} onChange={e => update({ description: e.target.value })} /></label><label>구분<select disabled={row.change.mode === 'auto' || (row.change.mode === 'keep' && row.isGenerated)} value={row.barcodeType} onChange={e => update({ barcodeType: e.target.value as BarcodeDraft['barcodeType'] })}><option value="Internal">내부 관리용 Code 128</option><option value="External">외부·제조사 바코드</option></select></label></div>
  </section>
}
export default function ProductBarcodes({ packaging, packagingDraft, onPackagingChange, unit, rows, setRows, endpoint, productId, code, productName, productCode, busy }: {
  packaging: Packaging; packagingDraft: BarcodePackagingDraft; onPackagingChange: BarcodePackagingChange; unit: string; rows: BarcodeDraft[]; setRows: Dispatch<SetStateAction<BarcodeDraft[]>>; endpoint: string; productId?: string; code: string; productName?: string; productCode?: string; busy: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [scanError, setScanError] = useState(''), [scanMessage, setScanMessage] = useState('')
  function addScan(value: string) {
    if (busy) return false
    setScanMessage('')
    const duplicate = rows.find(r => barcodeInputValue(r.change, r.current) === value)
    if (duplicate) { setSelected(duplicate.key); setScanError('이미 목록에 있는 바코드입니다. 기존 바코드를 확인해 주세요.'); return false }
    const empty = rows.find(r => !r.id && !barcodeInputValue(r.change, r.current))
    if (!empty && rows.length >= 30) { setScanError('바코드는 최대 30개까지 등록할 수 있습니다.'); return false }
    const key = empty?.key || crypto.randomUUID()
    const patch = { change: { mode: 'manual' as const, value }, barcodeType: 'External' as const, isGenerated: false }
    setRows(list => empty ? list.map(r => r.key === empty.key ? { ...r, ...patch } : r) : [...list, { key, ...patch, packageCode: 'EA', isPrimary: list.length === 0, description: '' }])
    setSelected(key); setScanError(''); setScanMessage('바코드를 목록에 추가했습니다. 중복 확인 후 상품을 저장해 주세요.')
    return true
  }
  const preview = rows.find(r => r.key === selected) || rows.find(r => r.isPrimary) || rows[0]
  const value = preview ? barcodeInputValue(preview.change, preview.current) : ''
  return <section className="dialog-section product-barcode-section" aria-label="바코드 관리 영역">
    <div className="dialog-section-heading product-barcode-toolbar"><h3>바코드 관리</h3>
      <button type="button" className="secondary" disabled={busy || rows.length >= 30} onClick={() => { const key = crypto.randomUUID(); setSelected(key); setRows(list => [...list, { key, change: { mode: 'keep' }, isPrimary: list.length === 0, description: '', barcodeType: 'Internal', isGenerated: false }]) }}>+ 바코드 추가</button>
    </div>
    <div className="products-full product-barcode-workspace">
    <div className="product-barcode-scan">
      <BarcodeScanInput label="등록할 바코드 스캔" scanLabel="바코드 추가" autoFocus={false} disabled={busy} onScan={event => addScan(event.barcode)} />
      {scanError && <p className="alert error" role="alert">{scanError}</p>}
      {scanMessage && <p role="status">{scanMessage}</p>}
    </div>
    <div className="product-barcode-inputs">{rows.map((row, index) => <BarcodeRow packaging={packaging} packagingDraft={packagingDraft} onPackagingChange={onPackagingChange} unit={unit} key={row.key} row={row} index={index} endpoint={endpoint} productId={productId} code={code} busy={busy}
      duplicate={!!barcodeInputValue(row.change, row.current) && rows.some(r => r.key !== row.key && barcodeInputValue(r.change, r.current) === barcodeInputValue(row.change, row.current))}
      select={() => setSelected(row.key)} update={patch => setRows(list => list.map(r => r.key === row.key ? { ...r, ...patch } : r))}
      primary={checked => { setSelected(row.key); setRows(list => list.map(r => ({ ...r, isPrimary: r.key === row.key && checked }))) }}
      remove={() => setRows(list => list.filter(r => r.key !== row.key))} />)}
      {!rows.length && <p className="organization-help">바코드는 선택 사항입니다. 직접 입력하거나 자동 생성할 수 있습니다.</p>}
    </div>
    <aside className="product-barcode-preview" aria-label="선택 바코드 미리보기"><strong>바코드 미리보기{preview ? ` · 바코드 ${rows.indexOf(preview) + 1}${preview.isPrimary ? ' · 대표' : ''}` : ''}</strong>
      {value && !barcodeError(value) ? <RackBarcodeLabel kind="product" productName={productName} productCode={productCode} value={value} rackId={preview.key} rackCode={code} draft={value !== preview.current} /> : <p className="barcode-preview-empty">유효한 바코드를 입력하면 이미지가 바로 표시됩니다.</p>}
    </aside>
    </div>
  </section>
}
