import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProductSelectionDialog from '../../src/components/workspace/ProductSelectionDialog'
import { appendImportedProducts, type DocumentProductLine } from '../../src/document-paste'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
 const [open,setOpen]=useState(true),[lines,setLines]=useState<DocumentProductLine[]>([])
 const mode=new URLSearchParams(location.search).get('mode')==='shipment'?'shipment':'receipt'
 return <><button onClick={()=>setOpen(true)}>상품 추가 열기</button><output aria-label="문서 상품 수">{lines.length}</output>{open&&<ProductSelectionDialog endpoint={'/api/tenants/qa/'+mode} mode={mode} warehouseId="w" lines={lines} onDirtyChange={()=>{}} onClose={()=>setOpen(false)} onAdd={items=>{setLines(v=>appendImportedProducts(v,items,()=>({quantity:'',lot:'',expiry:'',serialText:''})));setOpen(false)}}/>}</>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
