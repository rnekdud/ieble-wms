import { warehouseTypes } from '../../warehouse-workspace-model'
import type { WarehouseBasics } from '../../warehouse-workspace-model'

export default function WarehouseBasicFields({ value, disabled, onChange }: { value: WarehouseBasics; disabled: boolean; onChange: (patch: Partial<WarehouseBasics>) => void }) {
  return <fieldset disabled={disabled} className="warehouse-basic-fields">
    <legend>창고 기본 정보</legend>
    <div className="warehouse-basic-grid">
      <label>시스템 창고 코드<input value={value.code || '최종 저장 시 자동 생성'} readOnly /></label>
      <label>창고명<input aria-label="창고명" required maxLength={200} value={value.name} onChange={e => onChange({ name: e.target.value })} /></label>
      <label>창고 유형<select aria-label="창고 유형" value={value.type} onChange={e => onChange({ type: e.target.value })}><option value="">미지정</option>{warehouseTypes.map(t => <option key={t}>{t}</option>)}{value.type && !warehouseTypes.includes(value.type) && <option>{value.type}</option>}</select></label>
      <label>자체 창고 코드 (선택)<input aria-label="자체 창고 코드" maxLength={64} value={value.customCode} onChange={e => onChange({ customCode: e.target.value })} /></label>
      {value.type === '기타' && <label>기타 유형 설명<input maxLength={500} value={value.typeDescription} onChange={e => onChange({ typeDescription: e.target.value })} /></label>}
      <label>주소<input maxLength={500} value={value.address} onChange={e => onChange({ address: e.target.value })} /></label>
      <label>상세 주소<input maxLength={300} value={value.addressDetail} onChange={e => onChange({ addressDetail: e.target.value })} /></label>
      <label>담당자<input maxLength={200} value={value.contactName} onChange={e => onChange({ contactName: e.target.value })} /></label>
      <label className="organization-checkbox"><input aria-label="창고 사용" type="checkbox" checked={value.isActive} onChange={e => onChange({ isActive: e.target.checked })} />사용</label>
      <label className="warehouse-basic-notes">비고<textarea maxLength={2000} rows={2} value={value.notes} onChange={e => onChange({ notes: e.target.value })} /></label>
    </div>
    <p className="organization-help">시스템 코드는 서버에서 자동 부여합니다. 자체 코드는 기업 내에서 중복될 수 없습니다.</p>
  </fieldset>
}
