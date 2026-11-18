import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProductManagement from '../../src/components/workspace/ProductManagement'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
  const [path, setPath] = useState('/app/products')
  const tenantId = new URLSearchParams(location.search).get('tenant')!
  return <main className="wms-content" style={{ margin: 0, padding: 16 }}><ProductManagement tenantId={tenantId} grants={['read', 'create', 'update']} onNavigate={setPath} detailId={path.startsWith('/app/products/') ? path.split('/').at(-1) : undefined}/></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
