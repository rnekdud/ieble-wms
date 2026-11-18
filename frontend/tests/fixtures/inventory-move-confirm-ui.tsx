import { createRoot } from 'react-dom/client'
import { BusinessAssigneeContext } from '../../src/business-assignee'
import InventoryMoveEditor from '../../src/components/workspace/InventoryMoveEditor'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/inventory.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'

createRoot(document.getElementById('root')!).render(
  <BusinessAssigneeContext.Provider value={{ tenantId: 'fixture', current: { id: 'qa-user', name: 'QA', code: 'QA' } }}>
    <InventoryMoveEditor endpoint="/api/tenants/fixture/inventory" stockId="source" onClose={() => { document.body.dataset.closed = 'true' }} onSaved={() => { document.body.dataset.saved = 'true' }} />
  </BusinessAssigneeContext.Provider>,
)

import '../../src/components/mobile/mobile.css'
