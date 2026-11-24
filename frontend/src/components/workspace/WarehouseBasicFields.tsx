import { t as uiText } from '../../i18n.ts'
import FormLabel from '../FormLabel'
import { LegacyAddressSearchField } from "../AddressSearchField"
import BusinessAssigneeField from "./BusinessAssigneeField"
import { warehouseTypes } from '../../warehouse-workspace-model'
import type { WarehouseBasics } from '../../warehouse-workspace-model'

export default function WarehouseBasicFields({ value, disabled, attempted = false, wizard = false, inline = false, onChange }: { value: WarehouseBasics; disabled: boolean; attempted?: boolean; wizard?: boolean; inline?: boolean; onChange: (patch: Partial<WarehouseBasics>) => void }) {
  const additionalFields = <div className="warehouse-basic-grid">
      <label>{uiText("기업 내부 창고 코드")}<input aria-label={uiText("자체 창고 코드")} maxLength={64} value={value.customCode} onChange={e => onChange({ customCode: e.target.value })} /><small>{uiText("기업 내에서 중복되지 않는 선택 코드입니다.")}</small></label>
      <BusinessAssigneeField feature="warehouses" label={uiText("창고 담당자")} userId={value.contactUserId} name={value.contactName} disabled={disabled} onChange={onChange} />
      <LegacyAddressSearchField address={value.address} addressDetail={value.addressDetail} disabled={disabled} onChange={onChange} />
      <label className="warehouse-basic-notes">{uiText("비고")}<textarea maxLength={2000} rows={2} value={value.notes} onChange={e => onChange({ notes: e.target.value })} /></label>
      <label className="organization-checkbox"><input aria-label={uiText("창고 사용")} type="checkbox" checked={value.isActive} onChange={e => onChange({ isActive: e.target.checked })} />{uiText("사용")}</label>
    </div>
  return <fieldset disabled={disabled} className="warehouse-basic-fields">
    <legend className={wizard ? 'sr-only' : undefined}>{uiText("기본 정보")}</legend>
    <p hidden={wizard} className="warehouse-system-code">{uiText("시스템 코드")} <strong>{value.code || uiText("저장 시 자동 생성")}</strong></p>
    <div className="warehouse-basic-grid">
      <label><FormLabel required>{uiText("창고명")}</FormLabel><input aria-label={uiText("창고명")} required maxLength={200} aria-invalid={attempted && !value.name.trim()} value={value.name} onChange={e => onChange({ name: e.target.value })} />{attempted && !value.name.trim() && <small className="warehouse-field-error">{uiText("창고명을 입력해 주세요.")}</small>}</label>
      <label>{uiText("창고 유형 (선택)")}<select aria-label={uiText("창고 유형")} value={value.type} onChange={e => onChange({ type: e.target.value })}><option value="">{uiText("미지정")}</option>{warehouseTypes.map(t => <option key={t} value={t}>{uiText(t)}</option>)}{value.type && !warehouseTypes.includes(value.type) && <option>{value.type}</option>}</select></label>
      {value.type === '기타' && <label>{uiText("기타 유형 설명")}<input maxLength={500} value={value.typeDescription} onChange={e => onChange({ typeDescription: e.target.value })} /></label>}
    </div>
    {inline ? additionalFields : <details className="warehouse-optional" open={wizard || undefined}><summary hidden={wizard}>{uiText("추가 정보")} <small>{uiText("내부 코드 · 주소 · 담당자 · 비고")}</small></summary>{additionalFields}</details>}

  </fieldset>
}
