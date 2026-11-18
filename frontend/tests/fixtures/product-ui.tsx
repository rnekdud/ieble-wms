import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import ProductManagement from '../../src/components/workspace/ProductManagement'
import '../../src/index.css'
import '../../src/components/workspace/rack-barcode.css'
import '../../src/components/workspace/warehouse-plan.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'

export function Fixture(){
 const query=new URLSearchParams(location.search)
 const [path,setPath]=useState(query.get('mode')==='list'?'/app/products':query.get('mode')==='new'?'/app/products/new':'/app/products/p')
 return <div className="wms-layout" style={{display:'block'}}><main className="wms-content" style={{margin:0,padding:16}}>{path==='/app/products'&&!query.has('full-list')?<p>상품 목록으로 이동했습니다.</p>:<ProductManagement tenantId="fixture-tenant" grants={query.has('no-delete')?['read','create','update']:['read','create','update','delete']} registration={path.endsWith('/new')} detailId={path==='/app/products/p'?'p':undefined} onNavigate={setPath}/>}</main></div>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
