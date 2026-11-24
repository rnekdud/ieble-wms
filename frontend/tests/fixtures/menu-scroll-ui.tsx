import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WorkspaceSidebar from '../../src/components/workspace/WorkspaceSidebar'
import MobileNavigation from '../../src/components/mobile/MobileNavigation'
import { useMobile } from '../../src/use-mobile'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/mobile/mobile.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
  const [path, setPath] = useState(new URLSearchParams(location.search).get('path') || '/app/settings/users')
  const [collapsed, setCollapsed] = useState(false), [count, setCount] = useState(0)
  const [ready, setReady] = useState(!location.search.includes('delayed'))
  const mobile = useMobile()
  const permissions = ready ? { users: ['read','menu'], 'org-chart': ['read','menu'], 'organization-items': ['read','menu'] } : {}
  return <div className="wms-layout" data-layout={mobile ? 'mobile' : 'desktop'}>
    {mobile ? <header className="wms-header" style={{position:'fixed',top:0,left:0,zIndex:20}}><MobileNavigation path={path} role="Master" permissions={{}} onNavigate={setPath} onGuide={()=>{}} /></header> : <WorkspaceSidebar path={path} collapsed={collapsed} onToggle={()=>setCollapsed(x=>!x)} role={location.search.includes('delayed') ? 'Administrator' : 'Master'} permissions={permissions} onNavigate={setPath} onOpenGuide={()=>{}} />}
    <main style={{marginLeft:mobile?0:260,height:2500}}><div style={{position:'fixed',right:10,top:10,zIndex:10}}>
      <button onClick={()=>setCount(x=>x+1)}>재렌더 {count}</button><button onClick={()=>setPath('/app/settings/items')}>항목 경로</button><button onClick={()=>setPath('/app/master/permissions')}>권한 경로</button><button onClick={()=>setPath('/app')}>홈 경로</button><button onClick={()=>setReady(true)}>권한 로드</button>
    </div><p>{path}</p><div style={{height:50,overflow:'auto'}} data-other-scroll><div style={{height:200}}>다른 스크롤</div></div></main>
  </div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
