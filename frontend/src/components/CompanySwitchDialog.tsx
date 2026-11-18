import { useState } from 'react'
import { api, type Session } from '../api'
import { requestNavigation } from '../navigation-guard'
import OrganizationDialog from './workspace/OrganizationDialog'
export default function CompanySwitchDialog({session,onClose,onResolved,onSwitched}:{session:Session;onClose:()=>void;onResolved:()=>Promise<unknown>;onSwitched:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  function select(tenantId:string){requestNavigation(()=>{void(async()=>{setBusy(true);setError('');try{await api('/api/auth/select-tenant',{tenantId});await onResolved();onSwitched();onClose()}catch(e){setError(e instanceof Error?e.message:'기업을 전환하지 못했습니다.')}finally{setBusy(false)}})()})}
  return <OrganizationDialog title="기업 전환" wide onClose={onClose} busy={busy}>
    <p>{session.user.displayName} · {session.user.userName}</p>
    {error&&<p className="alert error" role="alert">{error}</p>}
    <div className="company-access-options">{session.memberships.map(m=><button type="button" className="secondary" key={m.tenantId} disabled={busy||m.tenantId===session.selectedTenantId} onClick={()=>select(m.tenantId)}>{m.name}{m.tenantId===session.selectedTenantId?' · 현재 기업':''}</button>)}</div>
  </OrganizationDialog>
}
