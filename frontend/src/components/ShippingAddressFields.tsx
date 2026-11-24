import { t as uiText } from '../i18n.ts'
import { useRef, useState } from 'react'
import { AddressSearchDialog } from './AddressSearchField'
import './shipping-address.css'

// Shipping addresses remain editable, including addresses outside Korea.
export default function ShippingAddressFields({ label, postalCode, address, detail, disabled = false, showLabel = false, onChange }: {
  label: string; postalCode: string; address: string; detail: string; disabled?: boolean; showLabel?: boolean
  onChange: (address: string, detail: string, postalCode: string) => void
}) {
  const [search, setSearch] = useState(false)
  const detailInput = useRef<HTMLInputElement>(null)
  return <div className="shipping-address-fields" role="group" aria-label={uiText(label)}>
    {showLabel && <span>{uiText(label)}</span>}
    <label>{uiText("우편번호")}<span className="shipping-address-line"><input aria-label={uiText("{v0} 우편번호", { v0: uiText(label) })} autoComplete="off" maxLength={20} value={postalCode} disabled={disabled} onChange={e => onChange(address, detail, e.target.value)} /><button type="button" className="secondary" disabled={disabled} aria-label={uiText("{v0} 주소 검색", { v0: uiText(label) })} onClick={() => setSearch(true)}>{uiText("주소 검색")}</button></span></label>
    <label>{uiText("기본주소")}<input aria-label={uiText("{v0} 기본주소", { v0: uiText(label) })} autoComplete="off" maxLength={500} value={address} disabled={disabled} onChange={e => onChange(e.target.value, detail, postalCode)} /></label>
    <label>{uiText("상세주소")}<input ref={detailInput} aria-label={uiText("{v0} 상세주소", { v0: uiText(label) })} placeholder={uiText("상세주소 입력")} autoComplete="off" maxLength={500} value={detail} disabled={disabled} onChange={e => onChange(address, e.target.value, postalCode)} /></label>
    {search && <AddressSearchDialog onClose={() => setSearch(false)} onSelect={result => {
      const next = result.roadAddress.trim() || result.jibunAddress.trim() || result.address.trim()
      if (!next) return
      onChange(next, next === address && result.zonecode.trim() === postalCode ? detail : '', result.zonecode.trim())
      setSearch(false)
      requestAnimationFrame(() => detailInput.current?.focus())
    }} />}
  </div>
}
