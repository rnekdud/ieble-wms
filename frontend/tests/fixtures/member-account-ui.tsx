import { createRoot } from 'react-dom/client'
import UserManagement from '../../src/components/workspace/UserManagement'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function MemberAccountFixture() {
 const role=new URLSearchParams(location.search).get('role')||'master'
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><UserManagement tenantId="fixture" currentUserId={role} canCreate={role!=='reader'} canUpdate={role!=='reader'} isMaster={role==='master'} onAccessChanged={async()=>{}} /></main></div>
}
createRoot(document.getElementById('root')!).render(<MemberAccountFixture />)
