import { useCallback, useEffect, useRef } from 'react'
import SearchableChoiceField from './SearchableChoiceField'
export type PermissionGrade = { id: string; name: string; description?: string | null; isActive: boolean; isBuiltIn: boolean; memberCount: number; version: string }
export default function PermissionGradeChoice({ grades, value, onChange, disabled, name, label = '권한 등급' }: { grades: PermissionGrade[]; value: string; onChange: (value: string) => void; disabled?: boolean; name?: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null), mounted = useRef(false)
  useEffect(() => { if (mounted.current) input.current?.dispatchEvent(new Event('input', { bubbles: true })); else mounted.current = true }, [value])
  const loadPage = useCallback(async (search: string, page: number) => {
    const matches = grades.filter(x => x.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    return { items: matches.slice((page - 1) * 30, page * 30).map(x => ({ id: x.id, name: x.name, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false, code: x.isBuiltIn ? '' : '사용자 추가' })), total: matches.length, pageSize: 30 }
  }, [grades])
  const current = grades.find(x => x.id === value)
  return <>{name && <input ref={input} name={name} type="hidden" value={value} />}<SearchableChoiceField floating required endpoint="" kind="permission-grades" label={label} value={value} current={current && { id: current.id, name: current.name, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false, code: current.isBuiltIn ? '' : '사용자 추가' }} loadPage={loadPage} searchPlaceholder="권한명 검색" disabled={disabled} onChange={x => { if (x) onChange(x.id) }} /></>
}
