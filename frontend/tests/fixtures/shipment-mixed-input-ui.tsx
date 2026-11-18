import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ShipmentBarcodeWork from '../../src/components/workspace/ShipmentBarcodeWork'
import type { ShipmentDetail } from '../../src/shipment-model'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
const endpoint='/api/tenants/fixture/shipments'
export function Fixture() {
 const [data,setData]=useState<ShipmentDetail|null>(null),[done,setDone]=useState(false)
 useEffect(()=>{void fetch(endpoint+'/12345678-1234-1234-1234-123456789012').then(r=>r.json()).then(setData)},[])
 return <main className="wms-content" style={{margin:0,padding:16}}>{done?<p>완료</p>:data&&<ShipmentBarcodeWork initial={data} endpoint={endpoint} inspect={new URLSearchParams(location.search).has('inspect')} onChange={()=>{}} onComplete={()=>setDone(true)} onClose={()=>setDone(true)}/>}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
