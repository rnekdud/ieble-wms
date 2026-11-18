import assert from 'node:assert/strict'
import test from 'node:test'
import {barcodeRackRoutes} from '../src/barcode-route.ts'
import {barcodeStorageLocations,storageQuantityLabel} from '../src/barcode-storage.ts'
const shape=(type,x,y,width,height,extra={})=>({id:`${type}-${x}-${y}`,type,x,y,width,height,rotation:0,shape:'rectangle',label:type,rackId:null,zoneId:null,locationId:null,fill:'#ddd',...extra})
const doc=objects=>({schemaVersion:1,aspectRatio:1.6,objects})
export function warehouseFixture(){
 const objects=[shape('door',.5,.95,.12,.025,{label:'하단 출입구'}),shape('zone',.5,.28,.84,.32),shape('zone',.5,.72,.84,.32),shape('wall',.5,.05,.94,.016),shape('wall',.04,.5,.01,.9),shape('wall',.96,.5,.01,.9),shape('wall',.24,.95,.4,.016),shape('wall',.76,.95,.4,.016)]
 for(let i=0;i<6;i++)objects.push(shape('rack',[.22,.5,.78][i%3],i<3?.28:.72,.18,.2,{id:'obj-r'+i,rackId:'r'+i,label:'R-0'+(i+1)}))
 return doc(objects)
}
// Independent dense sampling of every returned segment against rotated physical outlines.
// Tests actual computed polylines, not a mock route response or just a "reachable" flag.
function inside(point,o,aspect,strict=true){
 const a=o.rotation*Math.PI/180,dx=(point.x-o.x)*aspect,dy=point.y-o.y,x=dx*Math.cos(a)+dy*Math.sin(a),y=-dx*Math.sin(a)+dy*Math.cos(a),w=o.width*aspect/2,h=o.height/2,e=strict?1e-8:-1e-8
 return o.shape==='ellipse'&&o.type==='shape'?(x/w)**2+(y/h)**2<1-e:Math.abs(x)<w-e&&Math.abs(y)<h-e
}
function verify(plan,route,id){
 assert(route,`route ${id} missing`)
 const door=plan.objects.find(o=>o.id===route.entranceId),rack=plan.objects.find(o=>o.rackId===id)
 assert(Math.hypot(route.points[0].x-door.x,route.points[0].y-door.y)<1e-12)
 assert(inside(route.points.at(-1),rack,plan.aspectRatio,false),'destination touches rack outline')
 assert(!inside(route.points.at(-1),rack,plan.aspectRatio),'destination not rack centre')
 for(let i=1;i<route.points.length;i++)for(let n=0;n<=300;n++){
  const a=route.points[i-1],b=route.points[i],p={x:a.x+(b.x-a.x)*n/300,y:a.y+(b.y-a.y)*n/300}
  assert(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1,'inside document boundary')
  for(const o of plan.objects.filter(o=>['rack','wall','shape'].includes(o.type)))if(inside(p,o,plan.aspectRatio))assert(o.type==='wall'&&plan.objects.some(d=>d.type==='door'&&inside(p,d,plan.aspectRatio,false)),`crosses ${o.id}`)
 }
}
test('saved WH01-shaped six-rack layout: no aisles, disconnected aisles and visual aisle through R-05',()=>{
 const base=warehouseFixture(),before=JSON.stringify(base)
 for(const extras of [[],[shape('aisle',.5,.5,.86,.1),shape('aisle',.5,.92,.12,.1)],[shape('aisle',.5,.7,.12,.44)]]){
  const plan={...base,objects:[...base.objects,...extras]},routes=barcodeRackRoutes(plan,['r0','r1','r2','r3','r4','r5'])
  assert.equal(routes.size,6);for(const [id,route] of routes)verify(plan,route,id)
  const top=routes.get('r1');assert(top.points.some(p=>Math.abs(p.x-.5)>.09),'R-05 must be avoided')
 }
 assert.equal(JSON.stringify(base),before,'no plan mutation')
})
test('thin full-width barriers block paths even under a manual aisle',()=>{
 for(const type of ['wall','rack','shape']){
  const plan=doc([shape('door',.1,.5,.01,.01),shape('rack',.8,.5,.1,.1,{rackId:'r'}),shape(type,.5,.5,.0001,1),shape('aisle',.5,.5,1,.1)])
  assert.equal(barcodeRackRoutes(plan,['r']).size,0)
 }
})
test('rotated racks and elliptical columns have real non-intersecting detours',()=>{
 const plan=doc([shape('door',.1,.5,.02,.05),shape('rack',.9,.5,.08,.08,{rackId:'r',rotation:30})])
 const direct=barcodeRackRoutes(plan,['r']).get('r')
 for(const kind of ['ellipse','rectangle']){
  const blocked={...plan,objects:[...plan.objects,shape('shape',.5,.5,.15,.7,{rotation:25,shape:kind})]}
  const route=barcodeRackRoutes(blocked,['r']).get('r');verify(blocked,route,'r');assert(route.distance>direct.distance+.05)
 }
})
test('closed room, outside enclosing walls, missing entrance, duplicated rack mapping stay unreachable',()=>{
 const plan=doc([shape('door',.1,.5,.05,.1),shape('rack',.7,.5,.1,.1,{rackId:'r'}),shape('wall',.55,.5,.01,.4),shape('wall',.85,.5,.01,.4),shape('wall',.7,.3,.31,.01),shape('wall',.7,.7,.31,.01)])
 assert.equal(barcodeRackRoutes(plan,['r']).size,0)
 const base=warehouseFixture();base.objects.push(shape('rack',.99,.5,.01,.1,{rackId:'outside'}));assert.equal(barcodeRackRoutes(base,['outside']).size,0)
 assert.equal(barcodeRackRoutes({...base,objects:base.objects.filter(o=>o.type!=='door')},['r0']).size,0)
 base.objects.push({...base.objects.find(o=>o.rackId==='r0'),id:'duplicate'});assert.equal(barcodeRackRoutes(base,['r0']).size,0)
})
test('multiple entrances choose shortest reachable door; blocked entrance never teleports',()=>{
 const plan=doc([shape('door',.05,.5,.01,.01,{id:'far'}),shape('door',.65,.5,.01,.01,{id:'near'}),shape('rack',.8,.5,.1,.1,{rackId:'r'})])
 let route=barcodeRackRoutes(plan,['r']).get('r');assert.equal(route.entranceId,'near');verify(plan,route,'r')
 plan.objects.push(shape('shape',.65,.5,.04,.04));route=barcodeRackRoutes(plan,['r']).get('r');assert.equal(route.entranceId,'far');verify(plan,route,'r')
})
test('trace aggregation uses warehouse + location ID + unit; same names never merge across IDs',()=>{
 const row={productId:'p',warehouseId:'w1',rackId:'r',locationId:'l1',unit:'EA',quantity:300,reservedQuantity:30,availableQuantity:270}
 const result=barcodeStorageLocations([row,{...row,quantity:400,reservedQuantity:50,availableQuantity:350},{...row,warehouseId:'w2',quantity:500,reservedQuantity:20,availableQuantity:480},{...row,locationId:'l2',quantity:2},{...row,unit:'BOX',quantity:7},{...row,locationId:'floor',rackId:null,quantity:4},{...row,locationId:'empty',quantity:0}])
 assert.equal(result.length,5);assert.equal(result[0].quantity,700);assert.equal(result[0].reservedQuantity,80);assert.equal(result[0].availableQuantity,620)
 assert.equal(storageQuantityLabel(result.filter(r=>r.unit==='EA')),'1,206 EA');assert.equal(result.find(r=>r.rackId===null).quantity,4)
})
test('six-rack navigation removes staircase turns while keeping orthogonal interior legs',()=>{
 const plan=warehouseFixture(),routes=barcodeRackRoutes(plan,['r0','r1','r2'])
 for(const [id,route] of routes){
  verify(plan,route,id)
  assert(route.points.length<=5,'previous staircase had up to 15 bends; only approach turns and one interior corner needed')
  for(let i=2;i<route.points.length-1;i++){
   const a=route.points[i-1],b=route.points[i]
   assert(Math.abs(a.x-b.x)<1e-10||Math.abs(a.y-b.y)<1e-10,'interior remains horizontal/vertical')
  }
 }
})
test('staggered walls retain necessary alternating turns instead of cutting across barriers',()=>{
 const plan=doc([shape('door',.08,.5,.02,.02),shape('rack',.92,.5,.06,.08,{rackId:'r'}),shape('wall',.35,.3,.012,.6),shape('wall',.65,.7,.012,.6)])
 const route=barcodeRackRoutes(plan,['r']).get('r');verify(plan,route,'r')
 assert(route.points.some(p=>p.x<.65&&p.y>.6),'must pass below the first wall')
 assert(route.points.some(p=>p.x>.35&&p.y<.4),'must pass above the second wall')
 assert(route.points.length>=6,'necessary detour bends remain')
})
