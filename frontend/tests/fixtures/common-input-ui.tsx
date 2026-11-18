import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Trash2, Plus } from 'lucide-react'
import { BusinessAssigneeContext } from '../../src/business-assignee'
import OrganizationDialog from '../../src/components/workspace/OrganizationDialog'
import BusinessAssigneeField from '../../src/components/workspace/BusinessAssigneeField'
import SearchableChoiceField from '../../src/components/workspace/SearchableChoiceField'
import QuantityInput from '../../src/components/workspace/QuantityInput'
import SearchFilters from '../../src/components/workspace/SearchFilters'
import Pagination from '../../src/components/Pagination'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/workspace/receipts.css'
import '../../src/components/workspace/stocktake.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const choice=(id:string,name:string,code='')=>({id,name,code,unit:null,lotManaged:false,expiryManaged:false,serialManaged:false})
export default function Fixture(){
 const [open,setOpen]=useState(true),[count,setCount]=useState('10'),[kg,setKg]=useState('1.5'),[price,setPrice]=useState('100.25'),[saved,setSaved]=useState(0),[assignee,setAssignee]=useState({contactUserId:'u1',contactName:'김철수'}),[warehouse,setWarehouse]=useState(choice('w1','아이블 냉동 창고'))
 return <><BusinessAssigneeField feature="receipts" label="미선택 담당자" name="" onChange={()=>{}}/><BusinessAssigneeContext.Provider value={{tenantId:'fixture'}}><main className="wms-layout" style={{display:'block',padding:16}}>
  <button onClick={()=>setOpen(true)}>등록 다시 열기</button><output aria-label="저장 횟수">{saved}</output>
  <SearchFilters onSearch={()=>{}} onReset={()=>{}}><SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="warehouses" label="창고 필터" value="w1" current={choice('w1','아이블 냉동 창고','WH02')} onChange={()=>{}}/></SearchFilters>
  <SearchableChoiceField titleTrigger endpoint="/api/tenants/fixture/receipts" kind="warehouses" label="도면 창고" value="w1" current={choice('w1','아이블 냉동 창고','WH02')} onChange={()=>{}}/>
  <Pagination page={1} total={100} pageSize={20} onChange={()=>{}}/>
  {open&&<OrganizationDialog title="공통 업무 등록" onClose={()=>setOpen(false)} actions={<><button type="button" className="secondary" onClick={()=>setOpen(false)}>취소</button><button form="common-form" className="primary" type="submit">업무 저장</button></>}>
   <form id="common-form" onSubmit={e=>{e.preventDefault();setSaved(n=>n+1);setOpen(false)}}>
    <div className="receipt-basic">
     <SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="warehouses" label="입고 창고" value={warehouse.id} current={warehouse} onChange={item=>{if(item)setWarehouse(item)}}/>
     <SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="partners" label="거래처" value="bp1" current={choice('bp1','공급 업체','BP01')} onChange={()=>{}}/>
     <SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="racks" label="랙" value="r1" current={choice('r1','랙 1','R-01')} onChange={()=>{}}/>
     <SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="locations" label="보관위치" value="l1" current={choice('l1','1단 2칸','BIN-0012')} onChange={()=>{}}/>
     <label>EA 수량<QuantityInput aria-label="EA 수량" unit="EA" min="0" value={count} onChange={e=>setCount(e.target.value)}/></label>
     <label>계량 수량<QuantityInput aria-label="계량 수량" unit="kg" min="0" value={kg} onChange={e=>setKg(e.target.value)}/></label>
     <label>가격<input aria-label="가격" type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
     <SearchableChoiceField endpoint="/api/tenants/fixture/receipts" kind="products" label="긴 선택 정보" value="long" current={{...choice('long','주요 이름','PR01'),customCode:'아주 긴 조직 및 부가 정보가 끝까지 보이는지 확인하는 물류관리부서',email:'long-address@example.test'}} onChange={()=>{}}/>
     <label>기준일<input aria-label="기준일" type="date" defaultValue="2026-11-12" /></label>
     <label>검색 입력<input aria-label="검색 입력" type="search" /></label>
     <label>특수 메모<textarea aria-label="특수 메모" rows={3} /></label>
     <label>상태<select aria-label="상태"><option>작성 중</option><option>완료</option></select></label>
    </div>
    <div style={{height:200}} aria-hidden="true" />
    <BusinessAssigneeField feature="receipts" userId={assignee.contactUserId} name={assignee.contactName} onChange={setAssignee}/>
    <div className="receipt-actions"><button type="button" className="secondary wms-icon-button" aria-label="행 삭제"><Trash2 size={16}/></button><button type="button" className="secondary"><Plus size={16}/>상품 추가</button></div>
   </form>
  </OrganizationDialog>}
 </main></BusinessAssigneeContext.Provider></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
