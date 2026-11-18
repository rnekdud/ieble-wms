import { createRoot } from 'react-dom/client'
import OrganizationItems from '../../src/components/workspace/OrganizationItems'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
createRoot(document.getElementById('root')!).render(<div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><OrganizationItems tenantId="qa-items" grants={new URLSearchParams(location.search).has('readOnly')?['read']:['read','create','update','delete']}/></main></div>)
