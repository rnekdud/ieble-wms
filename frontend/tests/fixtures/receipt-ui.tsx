import {BusinessAssigneeContext} from '../../src/business-assignee'
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import ReceiptManagement from '../../src/components/workspace/ReceiptManagement'
import '../../src/index.css'
import '../../src/components/workspace/rack-barcode.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
export function ReceiptFixture(){
 const query=new URLSearchParams(location.search),[closed,setClosed]=useState(false)
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}>{closed?<p>목록 이동 완료</p>:<ReceiptManagement tenantId="fixture" grants={query.has('readonly')?['read']:['read','create','update','confirm']} registration={query.get('mode')==='new'} detailId={query.get('mode')==='new'?undefined:'r'} onNavigate={()=>setClosed(true)}/>}</main></div>
}
createRoot(document.getElementById('root')!).render(<BusinessAssigneeContext.Provider value={{tenantId:"fixture",current:{id:"qa-user",name:"QA 담당자",code:"QA"}}}><ReceiptFixture/></BusinessAssigneeContext.Provider> )
