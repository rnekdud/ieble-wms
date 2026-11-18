import { createRoot } from 'react-dom/client'
import ProductManagement from '../../src/components/workspace/ProductManagement'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const q = new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(<main className="wms-content" style={{margin:0,padding:16}}>{q.has('login') ? null : <ProductManagement tenantId={q.get('tenant')!} detailId={q.get('product') || undefined} registration={q.has('new')} grants={q.has('readonly') ? ['read'] : ['read','create','update']} onNavigate={() => {}}/>}</main>)
