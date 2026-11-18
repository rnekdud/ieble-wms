import { useState } from 'react'
import type { BusinessAssignee } from '../../business-assignee'
import { useBusinessAssignee, type AssigneeFeature } from '../../use-business-assignee'
import SearchableChoiceField from './SearchableChoiceField'

export default function BusinessAssigneeField({ feature, label = '담당자', userId, name, disabled, onChange }: {
  feature: AssigneeFeature
  label?: string; userId?: string | null; name: string; disabled?: boolean
  onChange: (value: { contactUserId: string; contactName: string }) => void
}) {
  const [selected, setSelected] = useState<{ tenantId?: string; member: BusinessAssignee }>()
  const { tenantId, member, error } = useBusinessAssignee(feature, userId, selected)
  const value = userId || (name ? 'saved-unlinked-assignee' : '')
  return <div>
    <SearchableChoiceField floating required disabled={disabled || !tenantId} endpoint={`/api/tenants/${tenantId}/assignees`} kind={feature} label={label}
      value={value} current={value ? { id: value, name: member?.name || name, code: member?.code || '', email: member?.email ?? null, customCode: member?.customCode, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false } : undefined}
      searchPlaceholder="이름·부서·이메일·아이디 검색" emptyMessage="담당자로 지정할 수 있는 활성 구성원이 없습니다."
      onChange={choice => { if (choice) { setSelected({ tenantId, member: choice }); onChange({ contactUserId: choice.id, contactName: choice.name }) } }} />
    {error && <small role="status">{error}</small>}
    {!value && <small role="status">로그인 사용자와 기업 구성원 연결을 확인할 수 없습니다. 담당자를 선택해 주세요.</small>}
  </div>
}
