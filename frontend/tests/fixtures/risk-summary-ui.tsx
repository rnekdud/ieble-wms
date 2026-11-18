import { createRoot } from 'react-dom/client'
import Dashboard from '../../src/components/workspace/Dashboard'
import StockOverview from '../../src/components/workspace/StockOverview'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/workspace/products.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const props = { tenantId:'fixture',permissions:{warehouses:['menu','read'],'stock-overview':['menu','read']},onNavigate:()=>{} }
createRoot(document.getElementById('root')!).render(<div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}>{location.search.includes('inventory') ? <StockOverview {...props}/> : <Dashboard {...props}/>}</main></div>)
