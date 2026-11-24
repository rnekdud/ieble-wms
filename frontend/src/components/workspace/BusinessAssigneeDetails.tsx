import { t as uiText } from '../../i18n.ts'
import { useBusinessAssignee, type AssigneeFeature } from '../../use-business-assignee'
export default function BusinessAssigneeDetails({ feature, userId, name, prefix = '' }: { feature: AssigneeFeature; userId?: string | null; name: string; prefix?: string }) {
  const { member, error } = useBusinessAssignee(feature, userId)
  const details = [member?.customCode, member?.email || member?.code].filter(Boolean).join(' · ')
  return <span className="business-assignee-detail"><span>{prefix}{member?.name || name || '—'}</span>{details && <small>{details}</small>}{error && <small role="status">{uiText(error)}</small>}</span>
}
