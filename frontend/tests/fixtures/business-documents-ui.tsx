import { setLanguage } from '../../src/i18n'
import { createRoot } from 'react-dom/client'
import ReceiptManagement from '../../src/components/workspace/ReceiptManagement'
import ShipmentManagement from '../../src/components/workspace/ShipmentManagement'
import '../../src/index.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/mobile/mobile.css'
const type = new URLSearchParams(location.search).get('type')
createRoot(document.getElementById('root')!).render(<div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><button onClick={()=>setLanguage('en')}>English fixture</button><button onClick={()=>setLanguage('ko')}>Korean fixture</button>{type==='receipts'?<ReceiptManagement tenantId="fixture" grants={['read']} detailId="r" onNavigate={()=>{}}/>:<ShipmentManagement tenantId="fixture" grants={['read']} detailId="s" onNavigate={()=>{}}/>}</main></div>)
