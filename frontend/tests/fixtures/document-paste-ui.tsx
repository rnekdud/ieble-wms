import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import DocumentPasteDialog from '../../src/components/workspace/DocumentPasteDialog'
import { appendImportedProducts, type DocumentProductLine } from '../../src/document-paste'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/mobile/mobile.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
 const [open,setOpen]=useState(true),[lines,setLines]=useState<DocumentProductLine[]>([])
 const query=new URLSearchParams(location.search), mode=query.get('mode')==='shipment'?'shipments':'receipts'
 return <><button onClick={()=>setOpen(true)}>붙여넣기 열기</button><output aria-label="추가 결과">{JSON.stringify(lines.map(l=>({id:l.product?.id,quantity:l.quantity})))}</output>{open&&<DocumentPasteDialog endpoint={'/api/tenants/fixture/'+mode} quantityLabel={mode==='receipts'?'예정 수량':'요청 수량'} capacity={Number(query.get('capacity')||100)} onClose={()=>setOpen(false)} onAdd={items=>{setLines(v=>appendImportedProducts(v,items,()=>({quantity:'',lot:'',expiry:'',serialText:''})));setOpen(false)}}/>}</>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
