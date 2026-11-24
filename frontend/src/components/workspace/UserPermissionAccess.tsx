import { t as uiText } from '../../i18n.ts'
import PageSizeSelect from '../PageSizeSelect'
import SearchFilters from './SearchFilters'
import PermissionMatrix from './PermissionMatrix'
import './external-users.css'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { notifyAccessChanged } from '../../access-events'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import type { Employee, EmployeeList } from '../../types/organization'
import Pagination from '../Pagination'
import OrganizationDialog from './OrganizationDialog'
import UnsavedChangesDialog from './UnsavedChangesDialog'

type Grants = Record<string, string[]>
type Detail = {useIndividualPermissions:boolean;ceiling:Grants;collaboratorName:string;version:string;grants:Grants;features:{key:string;label:string;actions:string[]}[]}
export default function UserPermissionAccess({tenantId}:{tenantId:string}) {
  const [filter,setFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20)
  const [draft,setDraft]=useState({filter:'',search:''}),[revision,refresh]=useState(0)
  const [data,setData]=useState<{key:string;value:EmployeeList}|null>(null),[error,setError]=useState('')
  const [selected,setSelected]=useState<Employee|null>(null)
  const key=`${tenantId}:${filter}:${search}:${page}:${pageSize}:${revision}`
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{api<EmployeeList>(`/api/tenants/${tenantId}/users?${new URLSearchParams({accountType:filter,search,page:String(page),pageSize:String(pageSize)})}`).then(value=>{if(live){setData({key,value});setError('')}}).catch(e=>{if(live)setError(e.message)})},200);return()=>{live=false;clearTimeout(timer)}},[tenantId,filter,search,page,pageSize,key])
  const current=data?.key===key?data.value:null
  return <section className="wms-card permission-settings"><h2>{uiText("사용자별 접근 권한")}</h2><p className="organization-help">{uiText("내부 직원은 위 역할 권한을 사용합니다. 외부 협력사는 외부 협력사 탭의 공통 권한을 적용합니다. 아래에서 사용자별로 추가 제한할 수 있으며 협력사 허용 범위를 초과할 수 없습니다.")}</p>
    <SearchFilters onReset={() => { setDraft({ filter:'', search:'' }); setFilter(''); setSearch(''); setPage(1); refresh(n=>n+1) }} busy={!current && !error} onSearch={()=>{setFilter(draft.filter);setSearch(draft.search);setPage(1);refresh(n=>n+1)}} className="organization-filters"><label>{uiText("사용자 구분")}<select aria-label={uiText("권한 사용자 구분")} value={draft.filter} onChange={e=>{setDraft(v=>({...v,filter:e.target.value}))}}><option value="">{uiText("전체 사용자")}</option><option value="Internal">{uiText("내부 직원")}</option><option value="External">{uiText("외부 협력사")}</option></select></label><label>{uiText("사용자·소속 업체 검색")}<input maxLength={100} value={draft.search} onChange={e=>{setDraft(v=>({...v,search:e.target.value}))}} /></label></SearchFilters>
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {current ? <><div className="wms-table-scroll"><table className="wms-table"><thead><tr><th>{uiText("사용자")}</th><th>{uiText("계정 유형")}</th><th>{uiText("소속 업체")}</th><th>{uiText("사용 여부")}</th><th>{uiText("권한 관리")}</th></tr></thead><tbody>{current.items.map(u=><tr key={u.userId}><td>{u.name}<br/><small>{u.loginId}</small></td><td>{u.accountType==='External' ? uiText("외부 협력사") : uiText("내부 직원")}</td><td>{u.companyName||'—'}</td><td>{u.isActive ? uiText("활성") : uiText("비활성")}</td><td>{u.accountType==='External' ? <button className="secondary" aria-label={uiText("{v0} 접근 권한", { v0: u.name })} onClick={()=>requestNavigation(()=>setSelected(u))}>{uiText("접근 권한 설정")}</button> : u.role==='Master' ? uiText("기업 마스터 보호") : uiText("역할 권한 적용")}</td></tr>)}{!current.items.length && <tr><td colSpan={5}>{uiText("조건에 맞는 사용자가 없습니다.")}</td></tr>}</tbody></table></div><Pagination pageSizeControl={<PageSizeSelect value={pageSize} onChange={size=>{setPageSize(size);setPage(1)}} />} page={page} pageSize={current.pageSize} total={current.total} onChange={setPage}/></> : <p role="status">{uiText("사용자 조회 중…")}</p>}
    {selected&&<ExternalGrants key={selected.userId} tenantId={tenantId} user={selected} onClose={()=>setSelected(null)}/>}
  </section>
}
function ExternalGrants({tenantId,user,onClose}:{tenantId:string;user:Employee;onClose:()=>void}) {
  const [limited,setLimited]=useState(false)
  const [data,setData]=useState<Detail|null>(null),[draft,setDraft]=useState<Grants>({}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0)
  const endpoint=`/api/tenants/${tenantId}/permissions/users/${user.userId}`
  useEffect(()=>{let live=true;api<Detail>(endpoint).then(v=>{if(live){setData(v);setDraft(v.grants);setLimited(v.useIndividualPermissions);setError('')}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[endpoint,reload])
  const dirty=!!data&&(JSON.stringify(data.grants)!==JSON.stringify(draft)||limited!==data.useIndividualPermissions)
  const guard=useUnsavedNavigation(dirty||busy,busy)
  function toggle(key:string,action:string,checked:boolean) {setNotice('');setDraft(old=>{const values=new Set(old[key]);if(checked){values.add(action);values.add('menu');values.add('read')}else if(action==='menu'||action==='read')values.clear();else values.delete(action);return {...old,[key]:data!.features.find(f=>f.key===key)!.actions.filter(a=>values.has(a))}})}
  async function save(){if(!data||busy||!dirty)return;setBusy(true);setError('');try{const result=await api<{version:string;grants:Grants;useIndividualPermissions:boolean}>(endpoint,{version:data.version,grants:draft,useIndividualPermissions:limited});setData({...data,...result});setDraft(result.grants);guard.saved();setNotice('저장했습니다. 로그인 중인 사용자도 다음 요청부터 적용됩니다.');notifyAccessChanged()}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.')}finally{setBusy(false)}}
  return <><OrganizationDialog title={uiText("{v0} · 외부 협력사 접근 권한", { v0: user.name })} description={uiText("{v0} · 현재 기업의 업무 권한만 지정합니다. 관리자·결제·사용자·권한 관리 권한은 부여할 수 없습니다.", { v0: user.companyName })} size="large" busy={busy} onClose={()=>requestNavigation(onClose)}><div className="external-grants">
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}{notice && <p role="status" className="alert success">{uiText(notice)}</p>}
    {data && <label className="permission-option"><input type="checkbox" aria-label={uiText("개인별 추가 제한")} checked={limited} disabled={busy} onChange={e=>{setLimited(e.target.checked);setNotice('')}} />{uiText("개인별 추가 제한 적용 (해제하면 협력사 공통 권한 사용)")}</label>}
    {data ? <PermissionMatrix caption={uiText("{v0} 개인별 업무 권한", { v0: user.name })} features={data.features}
      checked={(key, action) => !!data.ceiling[key]?.includes(action) && (!limited || draft[key].includes(action))}
      disabled={(key, action) => busy || !limited || !data.ceiling[key]?.includes(action)} onChange={toggle} /> : <p>{uiText("권한 조회 중…")}</p>}
    <p className="organization-help">{uiText("메뉴·조회 해제 시 해당 업무의 권한이 모두 해제됩니다. 변경 전후 권한과 변경자·일시는 감사 로그에 기록됩니다.")}</p>
    <div className="dialog-actions">{error && <button className="secondary" disabled={busy} onClick={()=>requestNavigation(()=>{setReload(x=>x+1);guard.saved()})}>{uiText("다시 불러오기")}</button>}<button className="secondary dialog-close" disabled={busy} onClick={()=>requestNavigation(onClose)}>{uiText("닫기")}</button><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{uiText("권한 저장")}</button></div>
  </div></OrganizationDialog><UnsavedChangesDialog guard={guard}/></>
}
