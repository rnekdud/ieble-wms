import { useState } from 'react'
import { t as uiText, getLocale } from '../i18n'
import { api } from '../api'
import { labelApiError } from './api-error'
import type { Product, ProductList } from '../product-model'
import OrganizationDialog from '../components/workspace/OrganizationDialog'
import Pagination from '../components/Pagination'
import { useReportRead } from '../components/workspace/useReportRead'
import { paperError, uid } from './model'
import type { Design, Paper } from './model'
export type SavedDesign={id:string;name:string;kind:'template'|'paper';paperName:string;thumbnail:string|null;version:string;updatedAt:string;document:Design}
export function PaperDialog({paper,onClose,onUse,onSave,canSave}:{paper:Paper;onClose:()=>void;onUse:(p:Paper)=>void;onSave:(p:Paper)=>Promise<Paper>;canSave:boolean}){
 const [p,setP]=useState({...paper,id:'custom',manufacturer:'',code:'',source:undefined}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const fields:[keyof Paper,string][]=[['width','용지 가로(mm)'],['height','용지 세로(mm)'],['labelWidth','라벨 가로(mm)'],['labelHeight','라벨 세로(mm)'],['left','좌측 여백(mm)'],['top','상단 여백(mm)'],['gapX','가로 간격(mm)'],['gapY','세로 간격(mm)'],['columns','열 개수'],['rows','행 개수']]
 const valid=()=>{const e=paperError(p);setError(e||'');return !e}
 return <OrganizationDialog title={uiText('사용자 지정 용지')} showClose onClose={onClose} busy={busy} className="label-dialog" actions={<><button className="secondary" disabled={busy} onClick={onClose}>{uiText('취소')}</button><button className="secondary" disabled={busy||!canSave} onClick={async()=>{if(!valid())return;setBusy(true);try{const saved=await onSave(p);onUse(saved)}catch(e){setError(labelApiError(e))}finally{setBusy(false)}}}>{uiText('용지 저장 후 사용')}</button><button className="primary" disabled={busy} onClick={()=>{if(valid())onUse(p)}}>{uiText('이 용지 사용')}</button></>}>
  <div className="label-paper-fields"><label className="label-full">{uiText('용지 이름')}<input maxLength={100} value={p.name} onChange={e=>setP({...p,name:e.target.value})}/></label>{fields.map(([key,label])=><label key={key}>{uiText(label)}<input type="number" step={key==='columns'||key==='rows'?1:.1} value={Number(p[key])} onChange={e=>setP({...p,[key]:Number(e.target.value)})}/></label>)}</div>{error&&<p role="alert" className="alert error">{uiText(error)}</p>}
 </OrganizationDialog>
}
export function TemplateDialog({endpoint,kind,onClose,onLoad,canUpdate}:{endpoint:string;kind:'template'|'paper';onClose:()=>void;onLoad:(s:SavedDesign)=>void;canUpdate:boolean}){
 const [page,setPage]=useState(1),[search,setSearch]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[remove,setRemove]=useState<SavedDesign|null>(null),[rename,setRename]=useState<SavedDesign|null>(null),[name,setName]=useState('')
 const view=useReportRead<{items:SavedDesign[];page:number;total:number;pageSize:number}>(`${endpoint}?kind=${kind}&page=${page}&search=${encodeURIComponent(search)}`,revision)
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(e){setError(labelApiError(e))}finally{setBusy(false)}}
 return <OrganizationDialog title={uiText(kind==='paper'?'저장된 용지':'라벨 템플릿')} showClose busy={busy} onClose={onClose} className="label-dialog" size="medium">
  <label>{uiText('검색')}<input value={search} maxLength={100} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>
  {(error||view.error)&&<p role="alert" className="alert error">{uiText(error||view.error||'')}</p>}{view.loading&&<p role="status">{uiText('불러오는 중…')}</p>}
  {remove?<section className="label-template-confirm"><p>{uiText('이 템플릿을 삭제하시겠습니까? 현재 편집 내용은 유지됩니다.')}</p><button className="secondary" disabled={busy} onClick={()=>setRemove(null)}>{uiText('취소')}</button><button className="primary" disabled={busy} onClick={()=>void run(async()=>{await api(endpoint+'/'+remove.id+'/archive',{version:remove.version});setRemove(null);setRevision(n=>n+1)})}>{uiText('삭제')}</button></section>:rename?<form onSubmit={e=>{e.preventDefault();void run(async()=>{const full=await api<SavedDesign>(endpoint+'/'+rename.id);await api(endpoint+'/'+rename.id,{name,kind,version:rename.version,requestId:uid(),document:full.document,thumbnail:full.thumbnail});setRename(null);setRevision(n=>n+1)})}}><label>{uiText('템플릿명')}<input value={name} required maxLength={100} onChange={e=>setName(e.target.value)}/></label><div className="row-actions"><button type="button" className="secondary" onClick={()=>setRename(null)}>{uiText('취소')}</button><button className="primary" disabled={busy}>{uiText('이름 변경')}</button></div></form>:<ul className="label-template-list">{view.data?.items.map(s=><li key={s.id}>{s.thumbnail&&<img src={s.thumbnail} alt=""/>}<div><strong>{s.name}</strong><small>{s.paperName} · {new Date(s.updatedAt).toLocaleString(getLocale())}</small><div className="row-actions"><button className="secondary" disabled={busy} onClick={()=>void run(async()=>onLoad(await api<SavedDesign>(endpoint+'/'+s.id)))}>{uiText('불러오기')}</button>{canUpdate&&<><button className="secondary" disabled={busy} onClick={()=>{setRename(s);setName(s.name)}}>{uiText('이름 변경')}</button><button className="secondary" disabled={busy} onClick={()=>setRemove(s)}>{uiText('삭제')}</button></>}</div></div></li>)}</ul>}
  {view.data?.total===0&&<p>{uiText('저장된 항목이 없습니다.')}</p>}{view.data&&<Pagination {...view.data} onChange={setPage} disabled={busy}/>}
 </OrganizationDialog>
}
export function ProductPicker({tenantId,onClose,onPick}:{tenantId:string;onClose:()=>void;onPick:(p:Product)=>void}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1);const view=useReportRead<ProductList>(`/api/tenants/${tenantId}/products?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&isActive=true`)
 return <OrganizationDialog title={uiText('라벨에 사용할 상품')} onClose={onClose} showClose className="label-dialog"><label>{uiText('상품 검색')}<input value={search} maxLength={100} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>{view.error&&<p role="alert">{uiText(view.error)}</p>}<ul className="label-product-list">{view.data?.items.map(({product:p})=><li key={p.id}><span><strong>{p.name}</strong><small>{p.code} · {p.barcode||'—'}</small></span><button className="secondary" onClick={()=>onPick(p)}>{uiText('선택')}</button></li>)}</ul>{view.data&&<Pagination page={view.data.page} total={view.data.total} pageSize={view.data.pageSize} onChange={setPage}/>}</OrganizationDialog>
}
