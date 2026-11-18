import FormLabel from '../FormLabel'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { barcodeError, barcodeInputChange, barcodeInputValue } from '../../rack-barcode'
import type { BarcodeChange } from '../../rack-barcode'
import RackBarcodeLabel from './RackBarcodeLabel'
import OrganizationDialog from './OrganizationDialog'
import './rack-barcode.css'

type Props = {
  value: BarcodeChange; current?: string | null; disabled?: boolean
  warehouseEndpoint: string; rackId: string; rackCode: string
  compact?: boolean; candidateEndpoint?: string; label?: string; kind?: 'rack' | 'product' | 'location'
  inputOnly?: boolean; previewVisible?: boolean; required?: boolean
  onChange: (change: BarcodeChange) => void
}
export default function RackBarcodeFields({ value, current, disabled, warehouseEndpoint, rackId, rackCode, onChange, candidateEndpoint, label = '랙 바코드', kind = 'rack', compact = false, inputOnly = false, previewVisible = false, required = false }: Props) {
  const id = useId(), [validated, setValidated] = useState(false)
  const [confirm, setConfirm] = useState(false), [generating, setGenerating] = useState(false), [error, setError] = useState('')
  const latest = useRef({ value, current, disabled, warehouseEndpoint, rackId, onChange, candidateEndpoint })
  const alive = useRef(true), inFlight = useRef(false), revision = useRef(0)
  useLayoutEffect(() => { latest.current = { value, current, disabled, warehouseEndpoint, rackId, onChange, candidateEndpoint } })
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const text = barcodeInputValue(value, current), problem = text ? barcodeError(text) : null
  async function generate() {
    if (inFlight.current || latest.current.disabled) return
    inFlight.current = true; setGenerating(true); setConfirm(false); setError('')
    const started = latest.current, attempt = ++revision.current
    try {
      const endpoint = started.candidateEndpoint || started.warehouseEndpoint.replace(/(\/warehouses)(?:\/[^/]+)?$/, '$1/rack-barcode-candidates')
      const result = await api<{ value: string; proof: string }>(endpoint, {})
      const now = latest.current
      if (alive.current && attempt === revision.current && now.rackId === started.rackId && now.warehouseEndpoint === started.warehouseEndpoint && now.candidateEndpoint === started.candidateEndpoint && !now.disabled && barcodeInputValue(now.value, now.current) === barcodeInputValue(started.value, started.current)) {
        if (barcodeError(result.value) || !result.proof) throw new Error('자동 생성 응답을 확인할 수 없습니다. 다시 시도해 주세요.')
        now.onChange({ mode: 'auto', value: result.value, proof: result.proof }); setValidated(false)
      }
    } catch (e) { if (alive.current && attempt === revision.current) setError(e instanceof Error ? e.message : '바코드를 생성하지 못했습니다.') }
    finally { inFlight.current = false; if (alive.current) setGenerating(false) }
  }
  return <div className="rack-barcode-fields">
    <label htmlFor={id}><FormLabel required={required}>{label}</FormLabel></label>
    <div className="rack-barcode-input-row">
      <input id={id} aria-required={required || undefined} aria-label={label} autoComplete="off" spellCheck={false} disabled={disabled} value={text}
        placeholder="바코드 입력 또는 스캔" aria-describedby={`${id}-help`} aria-invalid={!!problem}
        onChange={e => { revision.current++; setValidated(false); setError(''); onChange(barcodeInputChange(e.target.value, current)) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.nativeEvent.isComposing) setValidated(true) } }} />
      <button type="button" className="secondary" disabled={disabled || generating} onClick={() => text ? setConfirm(true) : void generate()}>{generating ? '생성 중…' : '자동 생성'}</button>
    </div>
    <small id={`${id}-help`} className="organization-help">영문·숫자·기호 1~64자 · 자동 생성은 20자리 내부 관리용 Code 128이며 GS1/GTIN 발급이 아닙니다.</small>
    {problem && <p role="alert">{problem}</p>}
    {validated && !problem && !inputOnly && <p role="status">{text ? '입력 형식이 올바릅니다. 중복 여부는 저장 시 확인합니다.' : '바코드 없이 저장합니다.'}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    {current && text !== current && <p className="rack-barcode-warning">저장 후 기존 라벨을 교체해 주세요.</p>}
    {!inputOnly && (compact && !previewVisible ? <details className="barcode-output-details"><summary>미리보기 · 다운로드 · 인쇄</summary><RackBarcodeLabel kind={kind} value={text} rackId={rackId} rackCode={rackCode} draft={text !== (current || '')} /></details> : <RackBarcodeLabel kind={kind} value={text} rackId={rackId} rackCode={rackCode} draft={text !== (current || '')} />)}
    {confirm && <OrganizationDialog confirmation size="small" title="바코드 자동 생성 확인" onClose={() => setConfirm(false)}>
      <p>현재 입력값을 새 바코드로 바꾸시겠습니까? 실제 변경은 저장할 때 확정됩니다.</p>
      <div className="organization-row-actions"><button type="button" className="secondary" onClick={() => setConfirm(false)}>취소</button><button type="button" className="primary" onClick={generate}>확인</button></div>
    </OrganizationDialog>}
  </div>
}
