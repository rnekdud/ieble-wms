import {useState} from 'react'
import {BusinessAssigneeContext} from '../../src/business-assignee'
import {createRoot} from 'react-dom/client'
import ShipmentManagement from '../../src/components/workspace/ShipmentManagement'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
export function ShipmentFixture(){
 const query=new URLSearchParams(location.search),[path,setPath]=useState(query.get('mode')==='new'?'/app/shipments/new':'/app/shipments/12345678-1234-1234-1234-123456789012')
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><ShipmentManagement tenantId="fixture" grants={query.has('readonly')?['read']:['read','create','update','confirm']} registration={path.endsWith('/new')} detailId={/shipments\/[0-9a-f-]+$/.test(path)?path.split('/').at(-1):undefined} onNavigate={next=>{setPath(next);document.documentElement.dataset.documentPath=next}}/></main></div>
}
createRoot(document.getElementById('root')!).render(<BusinessAssigneeContext.Provider value={{tenantId:"fixture",current:{id:"qa-user",name:"QA 담당자",code:"QA"}}}><ShipmentFixture/></BusinessAssigneeContext.Provider> )
