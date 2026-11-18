import {useState} from 'react'
import {BusinessAssigneeContext} from '../../src/business-assignee'
import {createRoot} from 'react-dom/client'
import StocktakeManagement from '../../src/components/workspace/StocktakeManagement'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
import '../../src/components/mobile/mobile.css'
export function StocktakeFixture(){
 const query=new URLSearchParams(location.search),[path,setPath]=useState(query.get('path') || '/app/inventory/counts')
 return <BusinessAssigneeContext.Provider value={{tenantId:"fixture",current:{id:"qa-user",name:"실사 담당자 QA",code:"qa-user",customCode:"실사팀",email:"qa@example.test"}}}><div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}><StocktakeManagement tenantId="fixture" grants={query.has('readonly')?['read']:['read','create','count','update','confirm']} currentUser="실사 담당자 QA" registration={path.endsWith('/new')} detailId={/counts\/[0-9a-f-]+$/.test(path)?path.split('/').at(-1):undefined} onNavigate={next=>{setPath(next);history.replaceState(null,'','/__stocktake-ui?path='+encodeURIComponent(next))}}/></main></div></BusinessAssigneeContext.Provider>
}
createRoot(document.getElementById('root')!).render(<StocktakeFixture/> )
