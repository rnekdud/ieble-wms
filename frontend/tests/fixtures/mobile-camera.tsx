import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import BarcodeScanInput from '../../src/components/workspace/BarcodeScanInput'
import {createCameraDecoder} from '../../src/camera-decoder'
import JsBarcode from 'jsbarcode'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
Object.assign(window,{cameraQA:{createCameraDecoder,JsBarcode}})
export function Fixture(){
 const [codes,setCodes]=useState<string[]>([]),[show,setShow]=useState(true)
 return <main className="wms-content"><button onClick={()=>setShow(v=>!v)}>스캐너 전환</button>{show&&<BarcodeScanInput onScan={event=>{setCodes(v=>[...v,event.barcode]);return true}}/>}<output aria-label="처리 결과">{codes.join(',')}</output></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
