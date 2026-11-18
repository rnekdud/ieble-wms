import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PlanImportDialog from '../../src/components/workspace/PlanImportDialog'
import type { TemplateDocument } from '../../src/warehouse-templates'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture(){
 const [open,setOpen]=useState(true),[applied,setApplied]=useState<TemplateDocument>()
 return <><button onClick={()=>setOpen(true)}>이미지 도면 열기</button><output aria-label="적용한 도면" style={{display:'none'}}>{JSON.stringify(applied)}</output>{open&&<PlanImportDialog endpoint="/api/tenants/qa/plan-imports" onClose={()=>setOpen(false)} onApply={value=>{setApplied(value);setOpen(false)}}/>}</>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
