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
export function ReceiptGroupFixture(){
 const q=new URLSearchParams(location.search)
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><ReceiptManagement tenantId={q.get('tenant')!} grants={q.has('readonly')?['read']:['read','create','update','confirm']} registration={q.has('new')} detailId={q.has('new')?undefined:q.get('receipt')!} onNavigate={()=>{}}/></main></div>
}
createRoot(document.getElementById('root')!).render(<ReceiptGroupFixture/>)
