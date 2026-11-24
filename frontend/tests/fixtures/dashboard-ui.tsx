import { createRoot } from 'react-dom/client'
import Dashboard from '../../src/components/workspace/Dashboard'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/workspace/products.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
createRoot(document.getElementById('root')!).render(<div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><div className="wms-breadcrumb"><span>워크스페이스</span><span>›</span><span>대시보드</span></div><Dashboard userId={new URLSearchParams(location.search).get('user') || 'qa'} tenantId="fixture" permissions={{warehouses:['menu','read'],'stock-overview':['menu','read'],receipts:['menu','read'],shipments:['menu','read']}} onNavigate={path=>{document.documentElement.dataset.navigation=path}}/></main></div>)
