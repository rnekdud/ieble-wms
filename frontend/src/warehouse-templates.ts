import { emptyWorkspace, newStructure } from './warehouse-workspace-model.ts'
import type { WorkspaceDraft } from './warehouse-workspace-model.ts'
import { blankPlan } from './warehouse-plan-model.ts'
import type { PlanDocument, PlanObject } from './warehouse-plan-model.ts'
export type TemplateObject = Omit<PlanObject, 'id'|'rackId'|'zoneId'|'locationId'> & { rackIndex: number|null; zoneIndex: number|null }
export type TemplateZone = { name:string; code:string }
export type TemplateRack = TemplateZone & { levels:number; bays:number; zoneIndex:number|null }
export type TemplateDocument = { schemaVersion:1; aspectRatio:number; objects:TemplateObject[]; zones:TemplateZone[]; racks:TemplateRack[] }
export type DesignTemplate = { id:string; name:string; description:string|null; version:string; rackCount:number; createdAt:string; updatedAt:string; document:TemplateDocument }
// Explicit allowlist: no DB identity, barcode, stock, reservation or tracking metadata crosses this boundary.
export function templateFromWorkspace(draft:WorkspaceDraft,plan:PlanDocument):TemplateDocument {
  const racks=draft.racks.filter(r=>plan.objects.some(o=>o.rackId===r.clientId))
  const zones=draft.zones.filter(z=>plan.objects.some(o=>o.zoneId===z.clientId)||racks.some(r=>r.zoneClientId===z.clientId))
  const index=(id:string|null|undefined,items:{clientId:string}[])=>{const i=items.findIndex(x=>x.clientId===id);return i<0?null:i}
  return {schemaVersion:1,aspectRatio:plan.aspectRatio,zones:zones.map(z=>({name:z.name,code:z.code})),racks:racks.map(r=>({name:r.name,code:r.code,levels:r.levels,bays:r.bays,zoneIndex:index(r.zoneClientId,zones)})),objects:plan.objects.map(o=>({type:o.type,label:o.label,x:o.x,y:o.y,width:o.width,height:o.height,rotation:o.rotation,fill:o.fill,shape:o.shape,rackIndex:index(o.rackId,racks),zoneIndex:index(o.zoneId,zones)}))}
}
export function instantiateTemplate(template:TemplateDocument,basics=emptyWorkspace().warehouse,id=()=>crypto.randomUUID()) {
  const zones=template.zones.map(z=>({...newStructure(id(),z.name),code:z.code}))
  const racks=template.racks.map(r=>({...newStructure(id(),r.name),code:r.code,levels:r.levels,bays:r.bays,zoneClientId:r.zoneIndex==null?null:zones[r.zoneIndex].clientId,barcodeChange:{mode:'none' as const}}))
  const draft:WorkspaceDraft={warehouse:basics,zones,racks,floorLocations:[]}
  const plan:PlanDocument={schemaVersion:1,aspectRatio:template.aspectRatio,objects:template.objects.map(o=>({id:id(),type:o.type,label:o.label,x:o.x,y:o.y,width:o.width,height:o.height,rotation:o.rotation,fill:o.fill,shape:o.shape,rackId:o.rackIndex==null?null:racks[o.rackIndex].clientId,zoneId:o.zoneIndex==null?null:zones[o.zoneIndex].clientId,locationId:null}))}
  return {draft,plan}
}
// New warehouses use the original populated layout with only central and entrance aisles.
export function defaultWarehouseTemplate():TemplateDocument {
  return generalWarehouseTemplate()
}
export function emptyWarehouseTemplate():TemplateDocument {
  return {schemaVersion:1,aspectRatio:blankPlan().aspectRatio,objects:[],zones:[],racks:[]}
}
export function generalWarehouseTemplate():TemplateDocument {
  const object=(type:PlanObject['type'],label:string,x:number,y:number,width:number,height:number,fill:string,rackIndex:number|null=null,zoneIndex:number|null=null):TemplateObject=>({type,label,x,y,width,height,fill,rackIndex,zoneIndex,rotation:0,shape:'rectangle'})
  return {schemaVersion:1,aspectRatio:1.6,zones:[{name:'보관 구역 A',code:'A'},{name:'보관 구역 B',code:'B'}],racks:Array.from({length:6},(_,i)=>({name:`랙 ${i+1}`,code:`R-${String(i+1).padStart(2,'0')}`,levels:3,bays:4,zoneIndex:i<3?0:1})),objects:[
    object('zone','보관 구역 A',.5,.28,.84,.32,'#edf4eb',null,0),object('zone','보관 구역 B',.5,.72,.84,.32,'#eaf1f6',null,1),
    object('aisle','중앙 통로',.5,.5,.86,.10,'#f1efe6'),object('aisle','출입 통로',.5,.92,.12,.10,'#f1efe6'),
    object('wall','외벽',.5,.05,.94,.016,'#6f817a'),object('wall','외벽',.04,.5,.01,.90,'#6f817a'),object('wall','외벽',.96,.5,.01,.90,'#6f817a'),object('wall','외벽',.24,.95,.40,.016,'#6f817a'),object('wall','외벽',.76,.95,.40,.016,'#6f817a'),object('door','출입구',.5,.95,.12,.025,'#aad7c5'),
    ...Array.from({length:6},(_,i)=>object('rack',`R-${String(i+1).padStart(2,'0')}`,.22+(i%3)*.28,i<3?.28:.72,.18,.20,'#c9dfe8',i)),
  ]}
}
