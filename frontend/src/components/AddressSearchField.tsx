import { t as uiText } from '../i18n.ts'
import ReadOnlyInput from './ReadOnlyInput'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import OrganizationDialog from './workspace/OrganizationDialog'
import { loadPostcode } from '../postcode-loader'
import { packAddress, selectedAddress, unpackAddress } from '../address-model'
import type { AddressValue, PostcodeResult } from '../address-model'
import './address-search.css'

export function AddressSearchDialog({ onSelect, onClose }: { onSelect: (result: PostcodeResult) => void; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onClose })
  useEffect(() => { callbacks.current = { onSelect, onClose } }, [onSelect, onClose])
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const element = host.current!
    const timeout = window.setTimeout(() => { if (active) setError('주소 검색 화면을 연결하지 못했습니다. 다시 시도해 주세요.') }, 20000)
    loadPostcode().then(Postcode => {
      if (!active) return
      new Postcode({ width: '100%', height: '100%', minWidth: 240,
        onresize: () => { if (active) { window.clearTimeout(timeout); setReady(true); setError('') } },
        oncomplete: result => { if (active) callbacks.current.onSelect(result) },
      }).embed(element)
    }).catch(e => { if (active) { window.clearTimeout(timeout); setError(e instanceof Error ? e.message : '주소 검색을 불러오지 못했습니다.') } })
    return () => { active = false; window.clearTimeout(timeout); element.replaceChildren() }
  }, [attempt])
  return createPortal(<OrganizationDialog title={uiText("주소 검색")} className="address-search-dialog" closeOnBackdrop onClose={onClose} actions={<button type="button" className="secondary" onClick={onClose}>{uiText("닫기")}</button>}>
    {error ? <div className="address-search-error"><p role="alert">{uiText(error)}</p><button type="button" className="secondary" onClick={() => { setReady(false); setError(''); setAttempt(n => n + 1) }}>{uiText("다시 시도")}</button></div> : !ready && <p role="status">{uiText("주소 검색을 불러오는 중…")}</p>}
    <div ref={host} className="address-search-embed" aria-label={uiText("카카오 우편번호 검색")} hidden={!!error} />
  </OrganizationDialog>, document.body)
}

type Props = {
  value: AddressValue
  onChange: (value: AddressValue) => void
  overseas?: boolean
  disabled?: boolean
  maxAddress?: number
  maxDetail?: number
  validate?: (value: AddressValue) => string | undefined
}
export default function AddressSearchField({ value, onChange, overseas = false, disabled = false, maxAddress = 500, maxDetail = 500, validate }: Props) {
  const [open, setOpen] = useState(false), [error, setError] = useState('')
  const detail = useRef<HTMLInputElement>(null), focusAfterClose = useRef(false)
  useEffect(() => {
    if (open || !focusAfterClose.current) return
    focusAfterClose.current = false
    const frame = requestAnimationFrame(() => detail.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])
  function change(next: AddressValue) {
    const problem = validate?.(next)
    if (problem) { setError(problem); return false }
    setError(''); onChange(next); return true
  }
  return <div className="address-search-field">
    <div className="address-main-row">
      <div className="address-postal-row"><label>{uiText("우편번호")}<ReadOnlyInput aria-label={uiText("우편번호")} autoComplete="postal-code" readOnly={!overseas} disabled={disabled} maxLength={20} value={value.postalCode} onChange={e => change({ ...value, postalCode: e.target.value })} /></label>
        {!overseas && <button type="button" className="secondary" disabled={disabled || open} onClick={() => setOpen(true)}>{uiText("주소 검색")}</button>}
      </div>
      <label className="address-base-field">{uiText("기본주소")}<ReadOnlyInput aria-label={uiText("기본주소")} autoComplete="address-line1" readOnly={!overseas} disabled={disabled} maxLength={maxAddress} value={value.address} onChange={e => change({ ...value, address: e.target.value })} /></label>
      <label className="address-detail-field">{uiText("상세주소")}<input ref={detail} aria-label={uiText("상세주소")} autoComplete="address-line2" disabled={disabled} maxLength={maxDetail} value={value.addressDetail} onChange={e => change({ ...value, addressDetail: e.target.value })} /></label>
    </div>
    {error && <p role="alert" className="address-field-error">{uiText(error)}</p>}
    {open && <AddressSearchDialog onClose={() => setOpen(false)} onSelect={result => {
      const next = selectedAddress(result, value)
      if (!next.address || !/^\d{5}$/.test(next.postalCode)) { setError('주소 검색 결과를 확인하고 다시 선택해 주세요.'); setOpen(false); return }
      if (!change(next)) { setOpen(false); return }
      focusAfterClose.current = true
      setOpen(false)
    }} />}
  </div>
}

/** Adapter for existing APIs without separate postcode/detail columns. */
export function LegacyAddressSearchField({ address, addressDetail, disabled, onChange }: {
  address: string; addressDetail?: string; disabled?: boolean
  onChange: (patch: { address: string; addressDetail?: string }) => void
}) {
  const single = addressDetail === undefined
  return <AddressSearchField value={unpackAddress(address, addressDetail)} disabled={disabled} maxDetail={single ? 500 : 300}
    validate={value => packAddress(value, single).length > 500 ? '주소와 상세주소는 저장 가능한 500자 이내로 입력해 주세요.' : undefined}
    onChange={value => onChange({ address: packAddress(value, single), ...(!single ? { addressDetail: value.addressDetail } : {}) })} />
}

export function CompanyAddressField({ initial, disabled, onDirty }: { initial: string; disabled: boolean; onDirty: (dirty: boolean) => void }) {
  const [address, setAddress] = useState(initial)
  return <div className="company-address-field" onChange={e => e.stopPropagation()}>
    <input type="hidden" name="address" value={address} />
    <LegacyAddressSearchField address={address} disabled={disabled} onChange={next => { setAddress(next.address); onDirty(next.address !== initial) }} />
  </div>
}
