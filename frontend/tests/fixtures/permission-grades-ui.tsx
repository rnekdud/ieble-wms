import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import OrganizationItems from '../../src/components/workspace/OrganizationItems'
import PermissionSettings from '../../src/components/workspace/PermissionSettings'
import UserManagement from '../../src/components/workspace/UserManagement'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
 const [tab,setTab]=useState('items')
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><nav aria-label="QA 화면"><button onClick={()=>setTab('items')}>항목</button><button onClick={()=>setTab('permissions')}>권한</button><button onClick={()=>setTab('users')}>사용자</button></nav>{tab==='items'?<OrganizationItems tenantId="fixture" grants={['menu','read','create','update','delete']} />:tab==='permissions'?<PermissionSettings tenantId="fixture" />:<UserManagement tenantId="fixture" currentUserId="master" canCreate canUpdate isMaster onAccessChanged={async()=>{}} />}</main></div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
