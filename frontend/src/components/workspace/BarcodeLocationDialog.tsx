import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hand, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../../api'
import type { OverviewResult, OverviewRow } from '../../stock-overview-model'
import type { PlanResponse } from '../../warehouse-plan-model'
import type { RackRoute } from '../../barcode-route'
import { barcodeRackRoutes } from '../../barcode-route'
import { barcodeStorageLocations, storageQuantityLabel } from '../../barcode-storage'
import Pagination from '../Pagination'
import OrganizationDialog from './OrganizationDialog'
import SearchableChoiceField from './SearchableChoiceField'
import './barcode-location-dialog.css'
import PlanCanvas from './PlanCanvas'
import type { PlanCanvasHandle } from './PlanCanvas'
import './warehouse-plan.css'

// Read bounded API pages for this product only. A selected warehouse's positions are
// loaded separately; no other warehouse's drawing or inventory positions are requested.
async function pages(url:string,live:()=>boolean){
  const rows:OverviewRow[]=[];let page=1
  while(live()){
    const data=await api<OverviewResult>(`${url}&page=${page}&pageSize=100`)
    if(!live())return rows
    if(data.page!==page||!Array.isArray(data.items))throw new Error('재고가 변경되었습니다. 다시 조회해 주세요.')
    rows.push(...data.items)
    if(page*data.pageSize>=data.total)return rows
    if(!data.items.length)throw new Error('재고 목록을 끝까지 조회하지 못했습니다. 다시 조회해 주세요.')
    page++
  }return rows
}
export default function BarcodeLocationDialog({tenantId,productId,productName,onClose}:{tenantId:string;productId:string;productName:string;onClose:()=>void}){
  const [response,setResponse]=useState<{rows?:OverviewRow[];error?:string}|null>(null)
  const [warehouseId,setWarehouseId]=useState(''),[retry,setRetry]=useState(0)
  const endpoint=`/api/tenants/${tenantId}`
  useEffect(()=>{let live=true
    pages(`${endpoint}/reports/stock-overview?view=warehouse&productId=${encodeURIComponent(productId)}&active=all&status=all`,()=>live)
      .then(rows=>{if(live)setResponse({rows:rows.filter(r=>r.quantity>0&&r.warehouseId)})},e=>{if(live)setResponse({error:e instanceof Error?e.message:'보관 창고를 조회하지 못했습니다.'})})
    return()=>{live=false}
  },[endpoint,productId,retry])
  const warehouses=useMemo(()=>{const result=new Map<string,{id:string;name:string;rows:OverviewRow[]}>();for(const row of response?.rows||[]){const id=row.warehouseId!;if(!result.has(id))result.set(id,{id,name:row.warehouseName||'창고',rows:[]});result.get(id)!.rows.push(row)}return [...result.values()]},[response])
  const choices=useMemo(()=>warehouses.map(w=>({id:w.id,name:w.name,code:'',unit:null,lotManaged:false,expiryManaged:false,serialManaged:false})),[warehouses])
  const loadWarehouses=useCallback(async(search:string,page:number)=>{const filtered=choices.filter(w=>w.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));return {items:filtered.slice((page-1)*20,page*20),total:filtered.length,pageSize:20}},[choices])
  const selected=warehouses.find(w=>w.id===warehouseId)||warehouses[0]
  return <OrganizationDialog title={`상품 위치 찾기 — ${productName}`} className="barcode-location-dialog" onClose={onClose} actions={<button type="button" className="secondary" onClick={onClose}>닫기</button>}>
    {!response&&<p role="status">보관 창고를 조회하고 있습니다…</p>}
    {response?.error&&<p role="alert">{response.error} <button type="button" className="secondary" onClick={()=>{setResponse(null);setRetry(v=>v+1)}}>다시 조회</button></p>}
    {response?.rows&&!warehouses.length&&<p>현재 보관 중인 재고가 없습니다.</p>}
    {selected&&<><div className="barcode-location-warehouse is-title-picker"><SearchableChoiceField required titleTrigger hideLabel compact label="창고 선택" endpoint={endpoint} kind="warehouses" value={selected.id} current={choices.find(w=>w.id===selected.id)} loadPage={loadWarehouses} searchPlaceholder="보관 창고 검색" onChange={item=>{if(item)setWarehouseId(item.id)}} /></div>
      <WarehouseStorage key={`${selected.id}:${retry}`} endpoint={endpoint} warehouseId={selected.id} productId={productId} productName={productName}/></>}
  </OrganizationDialog>
}
function WarehouseStorage({endpoint,warehouseId,productId,productName}:{endpoint:string;warehouseId:string;productId:string;productName:string}){
  const [rows,setRows]=useState<OverviewRow[]|null>(null),[error,setError]=useState(''),[plan,setPlan]=useState<PlanResponse|null>(null),[planError,setPlanError]=useState('')
  const [picked,setPicked]=useState<string|null>(null),[page,setPage]=useState(1),[pan,setPan]=useState(false)
  const canvas=useRef<PlanCanvasHandle>(null)
  useEffect(()=>{let live=true
    pages(`${endpoint}/reports/stock-overview?view=location&productId=${encodeURIComponent(productId)}&warehouseId=${encodeURIComponent(warehouseId)}&active=all&status=all`,()=>live).then(data=>{if(live)setRows(data)},e=>{if(live)setError(e.message)})
    api<PlanResponse>(`${endpoint}/warehouses/${warehouseId}/plan`).then(data=>{if(live)setPlan(data)},e=>{if(live)setPlanError(e.message)})
    return()=>{live=false}
  },[endpoint,warehouseId,productId])
  const locations=useMemo(()=>barcodeStorageLocations(rows||[]),[rows])
  const selected=locations.find(row=>row.key===picked)||(!picked?locations.find(row=>row.rackId)||locations[0]:undefined)
  const rackIds=useMemo(()=>[...new Set(locations.flatMap(row=>row.rackId?[row.rackId]:[]))],[locations])
  const routes=useMemo(()=>plan?.exists?barcodeRackRoutes(plan,rackIds):new Map<string,RackRoute>(),[plan,rackIds])
  const route=selected?.rackId?routes.get(selected.rackId):undefined
  const appearances=useMemo(()=>Object.fromEntries(rackIds.map(id=>{const group=locations.filter(row=>row.rackId===id);return [id,{fill:'#fff1b8',label:group[0].rackCode||group[0].rackName||'보관 랙',summary:`${productName} · ${storageQuantityLabel(group)}`}]})),[rackIds,locations,productName])
  const selectedObject=plan?.objects.find(o=>o.type==='rack'&&o.rackId===selected?.rackId)
  function pickRack(id:string){const row=locations.find(row=>row.rackId===id);if(row){setPicked(row.key);setPage(Math.floor(locations.indexOf(row)/20)+1)}}
  return <div className="barcode-warehouse-storage">
    {error&&<p role="alert">{error}</p>}
    {planError?<p role="alert">도면을 조회할 수 없습니다. {planError}</p>:!plan?<p role="status">저장된 도면을 불러오고 있습니다…</p>:!plan.exists?<p>등록된 창고 도면이 없습니다.</p>:<>
      <div className="barcode-location-map"><div className="barcode-location-map-controls" role="group" aria-label="도면 조작"><button className="secondary" aria-label="도면 화면 맞춤" onClick={()=>canvas.current?.fit()}><Scan size={17}/></button><button className="secondary" aria-label="도면 확대" onClick={()=>canvas.current?.zoom(1.25)}><ZoomIn size={17}/></button><button className="secondary" aria-label="도면 축소" onClick={()=>canvas.current?.zoom(.8)}><ZoomOut size={17}/></button><button className="secondary" aria-label="화면 이동" aria-pressed={pan} onClick={()=>setPan(v=>!v)}><Hand size={17}/></button></div>
      <PlanCanvas ref={canvas} document={plan} structureView editing={false} selected={selectedObject?[selectedObject.id]:[]} grid snap={false} pan={pan} rackAppearance={appearances} route={route} onSelect={()=>{}} onChange={()=>{}} onAdd={()=>{}} onOpenRack={pickRack}/></div>
      {!route && selected && <p className="barcode-route-notice" role="status">이동 가능한 경로를 찾을 수 없습니다.</p>}
    </>}
    <h4>보관 위치 상세</h4>
    {!rows&&!error&&<p role="status">위치별 재고를 조회하고 있습니다…</p>}
    {rows&&!locations.length&&<p>현재 보관 중인 재고가 없습니다.</p>}
    {!!locations.length&&<><div className="table-scroll barcode-location-table" tabIndex={0} role="region" aria-label="보관 위치 목록"><table className="organization-table"><thead><tr><th>구역</th><th>랙</th><th>보관위치</th><th>현재고</th></tr></thead><tbody>{locations.slice((page-1)*20,page*20).map(row=><tr key={row.key} aria-selected={selected?.key===row.key} onClick={()=>setPicked(row.key)}><td data-label="구역">{row.zoneName||'미지정'}</td><td data-label="랙">{row.rackCode||row.rackName||'미지정'}</td><td data-label="보관위치"><button className="barcode-location-pick" aria-pressed={selected?.key===row.key} onClick={()=>setPicked(row.key)}><span className="barcode-location-identity">{row.locationName||'미배치 재고'}{row.locationCode&&<small>{row.locationCode}</small>}{!row.rackId&&<small>미배치 재고 · 랙 미지정</small>}</span><span className="barcode-location-mobile-action" aria-hidden="true">위치 찾기</span></button></td><td data-label="현재고">{row.quantity.toLocaleString('ko-KR')} {row.unit}</td></tr>)}</tbody></table></div><Pagination page={page} total={locations.length} pageSize={20} onChange={setPage} label="보관 위치 페이지"/></>}
  </div>
}
