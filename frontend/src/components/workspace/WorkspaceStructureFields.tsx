import { t as uiText } from '../../i18n.ts'
import ReadOnlyInput from '../ReadOnlyInput'
import FormLabel from '../FormLabel'
import { useState, type ReactNode } from 'react'
import PlanColorField from './PlanColorField'
import RackDimensionFields from './RackDimensionFields'
import RackBarcodeFields from './RackBarcodeFields'
import type { DraftStructure, StructureKind } from '../../warehouse-workspace-model'
export default function WorkspaceStructureFields({kind,value,zones,disabled,endpoint,rotation,onRotate,fill,onFill,actions,onChange}: {endpoint:string;actions?:ReactNode;concise?:boolean;kind:StructureKind;value:DraftStructure;zones:DraftStructure[];disabled:boolean;fill?:string;onFill?:(fill:string)=>void;rotation?:number;onRotate?:(rotation:number)=>void;onChange:(patch:Partial<DraftStructure>)=>void}) {
 const [checked,setChecked]=useState(false),label={zones:'구역',racks:'랙',floorLocations:'바닥 위치'}[kind]
 const nameField=<label><FormLabel required>{uiText(label)}{uiText("명")}</FormLabel><input aria-label={uiText("{v0} 이름", { v0: uiText(label) })} required maxLength={200} value={value.name} onChange={e=>onChange({name:e.target.value})}/>{checked&&!value.name.trim() && <small className="warehouse-field-error">{uiText("이름을 입력해 주세요.")}</small>}</label>
 const codeField=<label><FormLabel required>{uiText(label)} {uiText("코드")}</FormLabel><input aria-label={uiText("{v0} 코드", { v0: uiText(label) })} required maxLength={kind==='floorLocations'?64:32} value={value.code} onChange={e=>onChange({code:e.target.value})}/>{checked&&!value.code.trim() && <small className="warehouse-field-error">{uiText("코드를 입력해 주세요.")}</small>}</label>
 const zoneField=<label>{uiText("소속 구역")}<select aria-label={uiText("{v0} 소속 구역", { v0: uiText(label) })} disabled={!!value.id} value={value.zoneClientId||''} onChange={e=>onChange({zoneClientId:e.target.value||null})}><option value="">{uiText("구역 없음")}</option>{zones.map(z=><option key={z.clientId} value={z.clientId}>{z.code} · {z.name}{z.isActive ? '' : uiText("(미사용)")}</option>)}</select></label>
 return <fieldset disabled={disabled} className={`workspace-structure-fields ${kind==='racks'?'rack-core-fields':''}`} onInvalidCapture={()=>setChecked(true)}>
 {kind==='racks' ? <>
 {nameField}
 <div className="rack-dimension-row"><RackDimensionFields key={value.clientId} value={value} onChange={onChange} showTotal/></div>
 {actions}
 <RackBarcodeFields compact previewVisible warehouseEndpoint={endpoint} rackId={value.id||value.clientId} rackCode={value.code} value={value.barcodeChange||{mode:value.id?'keep':'none'}} current={value.barcode} disabled={disabled} onChange={barcodeChange=>onChange({barcodeChange})}/>
 <div className="rack-secondary-row">{value.id ? <label>{uiText("랙 코드")}<ReadOnlyInput aria-label={uiText("랙 코드")} readOnly value={value.code}/></label> : codeField}{zoneField}{onRotate && <label>{uiText("방향 (°)")}<input aria-label={uiText("객체 회전")} type="number" min={-180} max={180} step={.01} value={Math.round((rotation||0)*100)/100} onChange={e=>{if(e.target.value&&e.target.validity.valid)onRotate(Number(e.target.value))}}/></label>}{fill&&onFill&&<PlanColorField value={fill} onChange={onFill} disabled={disabled}/>}</div><label className="organization-checkbox rack-active-field">{uiText("사용 여부")}<input type="checkbox" aria-label={uiText("{v0} 사용", { v0: uiText(label) })} checked={value.isActive} onChange={e=>onChange({isActive:e.target.checked})}/></label>
 </> : <>{nameField}{codeField}{kind==='floorLocations' && <>{zoneField}<RackBarcodeFields compact kind="location" label={uiText("보관 위치 바코드")} candidateEndpoint={endpoint.replace(/\/warehouses$/, '/barcodes/candidates?kind=location')} warehouseEndpoint={endpoint} rackId={value.id||value.clientId} rackCode={value.code} value={value.barcodeChange||{mode:'keep'}} current={value.barcode} disabled={disabled} onChange={barcodeChange=>onChange({barcodeChange})}/></>}<label className="organization-checkbox"><input type="checkbox" aria-label={uiText("{v0} 사용", { v0: uiText(label) })} checked={value.isActive} onChange={e=>onChange({isActive:e.target.checked})}/>{uiText("사용")}</label></>}
 </fieldset>
}
export function ShelfPreview({rack}:{rack:DraftStructure}){
 const valid=Number.isInteger(rack.levels)&&Number.isInteger(rack.bays)&&rack.levels>0&&rack.bays>0&&rack.levels<=100&&rack.bays<=100&&rack.levels*rack.bays<=1000
 return <details className="rack-shelf-preview" open><summary>{uiText("보관 위치 구성 ·")} {valid ? rack.levels*rack.bays : 0}{uiText("개")}</summary>{valid ? <><div className="shelf-mini-grid" style={{gridTemplateColumns:`repeat(${rack.bays},minmax(28px,1fr))`}}>{Array.from({length:Math.min(rack.levels*rack.bays,100)},(_,i)=><span key={i}>{rack.levels-Math.floor(i/rack.bays)}{uiText("단")}<br/>{i%rack.bays+1}{uiText("칸")}</span>)}</div>{rack.levels*rack.bays>100 && <small>{uiText("앞쪽 100개 칸 미리보기 · 전체 위치는 보관 위치 보기에서 확인")}</small>}<small>{rack.id ? uiText("기존 위치는 유지됩니다.") : uiText("최종 창고 저장 시 실제 위치가 생성됩니다.")}</small></> : <p role="alert">{uiText("단·칸은 각각 1~100, 총 1,000개 이내로 입력해 주세요.")}</p>}</details>
}
