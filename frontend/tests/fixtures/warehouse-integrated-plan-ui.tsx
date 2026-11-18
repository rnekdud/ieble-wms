import { createRoot } from 'react-dom/client'
import { BusinessAssigneeContext } from '../../src/business-assignee'
import WarehouseManagement from '../../src/components/workspace/WarehouseManagement'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const q = new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(<BusinessAssigneeContext.Provider value={{tenantId:q.get('tenant')!,current:{id:'qa-user',name:'QA',code:'QA'}}}><main className="wms-content" style={{margin:0,padding:16}}><WarehouseManagement tenantId={q.get('tenant')!} grants={q.get('access')==='none'?[]:q.get('access')==='read'?['read']:['read','create','update']}/></main></BusinessAssigneeContext.Provider>)
