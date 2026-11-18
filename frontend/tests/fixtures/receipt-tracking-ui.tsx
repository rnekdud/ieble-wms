import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReceiptTrackingDialog from '../../src/components/workspace/ReceiptTrackingDialog'
import type { GroupAllocation } from '../../src/receipt-groups'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/receipt-scan.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const group = { productId: 'qa', productName: '농심 새우깡 90g', productCode: 'QA', unit: 'EA', expectedQuantity: 100, inspectedQuantity: 100, lines: [] }
export function Fixture() {
  const [open, setOpen] = useState(true), [entries, setEntries] = useState<GroupAllocation[]>([])
  return <><button onClick={() => setOpen(true)}>추적 정보 입력(선택)</button><output aria-label="저장된 추적 정보">{JSON.stringify(entries)}</output>{open && <ReceiptTrackingDialog group={group} tab="lot" initialEntries={entries} onDirtyChange={() => {}} onClose={() => setOpen(false)} onDraftSave={values => { setEntries(values); setOpen(false) }}/>}</>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
