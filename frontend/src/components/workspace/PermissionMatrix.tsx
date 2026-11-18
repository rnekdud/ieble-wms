import { workspaceMenus } from './navigation'
import './PermissionMatrix.css'

type Feature = { key: string; label: string; actions: string[] }
const primaryActions = ['menu', 'read', 'create', 'update', 'delete']
const actionLabels: Record<string, string> = {
  menu: '메뉴 접근', read: '조회', create: '등록', update: '수정', delete: '삭제',
  confirm: '최종 확정', move: '재고 이동', adjust: '재고 조정', count: '실사 수행',
  manageUsers: '사용자 관리', readAll: '기업 전체 문의 조회',
}
const actionLabel = (action: string) => actionLabels[action] || action

// Group only by the existing sidebar; no permission inheritance is introduced.
export default function PermissionMatrix({ caption, features, checked, disabled, onChange, labelPrefix = '' }: {
  caption: string
  features: Feature[]
  checked: (feature: string, action: string) => boolean
  disabled: (feature: string, action: string) => boolean
  onChange: (feature: string, action: string, checked: boolean) => void
  labelPrefix?: string
}) {
  const columns = [...primaryActions, ...Array.from(new Set(features.flatMap(f => f.actions))).filter(a => !primaryActions.includes(a))]
  const used = new Set<string>()
  const groups = workspaceMenus.flatMap(menu => {
    const keys = menu.page ? [menu.page.key] : menu.children?.map(p => p.key) || []
    const rows = keys.flatMap(key => { const feature = features.find(f => f.key === key); if (!feature) return []; used.add(key); return [feature] })
    return rows.length ? [{ label: menu.children ? menu.label : null, rows }] : []
  })
  const remaining = features.filter(f => !used.has(f.key))
  if (remaining.length) groups.push({ label: null, rows: remaining })
  return <div className="permission-matrix-scroll" role="region" aria-label={caption} tabIndex={0}>
    <table className="permission-matrix" style={{ minWidth: 220 + columns.length * 88 }}>
      <caption>{caption}</caption>
      <colgroup><col className="permission-menu-column" />{columns.map(a => <col key={a} />)}</colgroup>
      <thead><tr><th scope="col">메뉴</th>{columns.map(a => <th scope="col" key={a}>{actionLabel(a)}</th>)}</tr></thead>
      {groups.map((group, index) => <tbody key={group.label || index}>
        {group.label && <tr className="permission-group"><th scope="rowgroup">{group.label}</th><td colSpan={columns.length} /></tr>}
        {group.rows.map(f => <tr key={f.key}><th scope="row" className={group.label ? 'permission-child' : undefined}>{f.label}</th>
          {columns.map(a => <td key={a}>{f.actions.includes(a) ? <label className="permission-checkbox">
            <input type="checkbox" aria-label={`${labelPrefix}${f.label} ${actionLabel(a)}`} checked={checked(f.key, a)} disabled={disabled(f.key, a)} onChange={e => onChange(f.key, a, e.target.checked)} />
          </label> : <span className="permission-unavailable" aria-label={`${f.label} ${actionLabel(a)} 해당 없음`}>—</span>}</td>)}
        </tr>)}
      </tbody>)}
    </table>
  </div>
}
