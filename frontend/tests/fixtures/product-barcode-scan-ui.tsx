import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProductBarcodes from '../../src/components/workspace/ProductBarcodes'
import { barcodePayload, type BarcodeDraft } from '../../src/product-master-model'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
export function Fixture() {
  const [pack,setPack]=useState({innerPackQuantity:'5',outerPackQuantity:'',outerPackUnit:'INNER',palletPackQuantity:''})
  const [rows,setRows]=useState<BarcodeDraft[]>([]),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(true)
  return <main className="wms-content"><button onClick={()=>setBusy(v=>!v)}>잠금 전환</button><button onClick={()=>setShow(v=>!v)}>스캐너 전환</button><button onClick={()=>setRows(Array.from({length:30},(_,i)=>({key:String(i),id:String(i),current:`EXISTING${i}`,change:{mode:'keep'},isPrimary:i===0,description:'',barcodeType:'External',isGenerated:false})))}>기존 30개</button><form className="registration-form product-master-sections" onSubmit={e=>{e.preventDefault();setSaved(JSON.stringify(barcodePayload(rows)))}}>{show&&<ProductBarcodes rows={rows} setRows={setRows} packaging={{innerPackQuantity:pack.innerPackQuantity?Number(pack.innerPackQuantity):null,outerPackQuantity:pack.outerPackQuantity?Number(pack.outerPackQuantity):null,outerPackUnit:pack.outerPackUnit,palletPackQuantity:pack.palletPackQuantity?Number(pack.palletPackQuantity):null}} packagingDraft={pack} onPackagingChange={(key,value)=>setPack(p=>({...p,[key]:value}))} unit="EA" code="QA" endpoint="/api/tenants/fixture/products" busy={busy}/>}<button type="submit">상품 저장</button></form><output style={{display:'block',overflowWrap:'anywhere'}} aria-label="저장 결과">{saved}</output><output style={{display:'block',overflowWrap:'anywhere'}} aria-label="바코드 개수">{rows.length}</output></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
