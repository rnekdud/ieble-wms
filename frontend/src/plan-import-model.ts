import type { PlanDocument, PlanObject } from './warehouse-plan-model.ts'
import type { TemplateDocument } from './warehouse-templates.ts'
export type ImportRack = { name?: string; code: string; levels: number; bays: number }
export type ImportCandidate = { object: PlanObject; confidence: number; evidence: string; reviewRequired: boolean }
export type ImportJob = { id: string; fileName: string; status: 'Uploading'|'Inspecting'|'Rendering'|'Ready'|'Analyzing'|'Completed'|'Failed'; error: string|null; page: number; rotation: number; revision: number; expiresAt: string; metadata: { pageCount:number; width:number; height:number; sourceWidth:number; sourceHeight:number; aspectRatio:number; warnings:string[] }|null; result: { aspectRatio:number; candidates:ImportCandidate[]; warnings:string[]; engine:string }|null }
export function importTemplate(plan:PlanDocument,racks:Record<string,ImportRack>):TemplateDocument {
  const rs=plan.objects.filter(o=>o.type==='rack'),zs=plan.objects.filter(o=>o.type==='zone')
  if(rs.some(o=>!racks[o.id] || !/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(racks[o.id].code) || ![racks[o.id].levels,racks[o.id].bays].every(n=>Number.isInteger(n)&&n>=1&&n<=100) || racks[o.id].levels*racks[o.id].bays>1000))throw Error('모든 랙의 코드·단수·칸수를 직접 확인해 주세요.')
  if(rs.some(o=>(racks[o.id].name?.trim().length||0)>200))throw Error('랙 이름은 200자 이내로 입력해 주세요.')
  if(new Set(rs.map(o=>racks[o.id].code)).size!==rs.length)throw Error('랙 코드가 중복됩니다.')
  return {schemaVersion:1,aspectRatio:plan.aspectRatio,racks:rs.map(o=>({...racks[o.id],name:racks[o.id].name?.trim()||racks[o.id].code,zoneIndex:null})),zones:zs.map((o,i)=>({name:o.label||`구역 ${i+1}`,code:`Z-${String(i+1).padStart(2,'0')}`})),objects:plan.objects.map(o=>({type:o.type,label:o.type==='rack'?(racks[o.id].name?.trim()||racks[o.id].code):o.label,x:o.x,y:o.y,width:o.width,height:o.height,rotation:o.rotation,fill:o.fill,shape:o.shape,rackIndex:o.type==='rack'?rs.indexOf(o):null,zoneIndex:o.type==='zone'?zs.indexOf(o):null}))}
}
export function importFileError(file:{name:string;size:number}) { return !/\.(pdf|png|jpe?g|webp)$/i.test(file.name) ? 'PDF·PNG·JPG·JPEG·WEBP 파일을 선택하세요.' : file.size<12||file.size>20*1024*1024 ? '파일은 20MB 이하로 선택하세요.' : '' }
