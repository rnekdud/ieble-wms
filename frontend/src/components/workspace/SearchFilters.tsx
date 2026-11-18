import { Children, isValidElement, useState, type ReactNode } from 'react'
import { useMobile } from '../../use-mobile'
import ReportPeriodFields from './ReportPeriodFields'
import { Search } from 'lucide-react'
import OrganizationDialog from './OrganizationDialog'
import './list-period-layout.css'

function hasPeriodFields(children: ReactNode): boolean {
  return Children.toArray(children).some(child => isValidElement<{ children?: ReactNode }>(child) && (child.type === ReportPeriodFields || hasPeriodFields(child.props.children)))
}
function isSearchField(child: ReactNode): boolean {
  return isValidElement<{ children?: ReactNode }>(child) && child.type === 'label' && Children.toArray(child.props.children).some(input => isValidElement<{ type?: string }>(input) && input.type === 'input' && input.props.type !== 'date')
}

/** Apply or reset only the page's query state; never mutate business records. */
export default function SearchFilters({ id, children, onSearch, onReset, busy = false, className = '', label = '목록 검색' }: {
  id?: string; children: ReactNode; onSearch: () => void; onReset: () => void; busy?: boolean; className?: string; label?: string
}) {
  const [confirm, setConfirm] = useState(false)
  const mobile = useMobile(), fields = Children.toArray(children)
  const searchIndex = fields.reduce<number>((last, child, index) => isSearchField(child) ? index : last, -1)
  const groupSearch = !mobile && searchIndex >= 0 && hasPeriodFields(children)
  const actions = <div className="list-search-actions"><button className="primary list-search-submit" type="submit" disabled={busy}><Search size={16} aria-hidden="true" />검색</button>
    <button className="secondary list-search-reset" type="button" disabled={busy} onClick={() => setConfirm(true)}>초기화</button></div>
  return <><form id={id} className={`list-search-filters select-first-filters ${className}`} aria-label={label} onSubmit={event => { event.preventDefault(); if (!busy) onSearch() }}>
    {groupSearch ? fields.map((field, index) => index === searchIndex ? <div key="search-actions" className="list-search-query-actions">{field}{actions}</div> : field) : children}
    {!groupSearch && actions}
  </form>{confirm && <OrganizationDialog title="필터 초기화" confirmation size="small" onClose={() => setConfirm(false)} actions={<><button type="button" className="secondary" onClick={() => setConfirm(false)}>취소</button><button type="button" className="primary" disabled={busy} onClick={() => { setConfirm(false); onReset() }}>초기화</button></>}><p>입력한 검색어와 선택한 필터 조건이 모두 초기화됩니다.</p><p>계속하시겠습니까?</p></OrganizationDialog>}</>
}
