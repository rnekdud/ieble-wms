import { t as uiText } from '../i18n'
import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { clone } from './model'
import { pixelsPerMm, pointerDeltaMm } from './viewport'
import type { Point } from './viewport'
import type { Design, Label, LabelObject } from './model'
import { intersectingObjects, hitObject, moveSelection, selectionBounds, selectionRect } from './selection'
import { renderObject } from './render'

type Drag = { pointerId:number; threshold:number; moved:boolean; id:string; resize:boolean; x:number; y:number; object:LabelObject; label:Label; ids:string[]; tapIds:string[] }
type Marquee = { pointerId:number; x:number; y:number; start:Point; end:Point; moved:boolean; base:string[];  }
export default function LabelCanvas({design,index,selected,onSelect,onChange,zoom,snap,editing,onEdit,multiSelect}:{editing:string|null;onEdit:(id:string)=>void;multiSelect:boolean;design:Design;index:number;selected:string[];onSelect:(ids:string[])=>void;onChange:(label:Label)=>void;zoom:number;snap:boolean}){
 const [preview,setPreview]=useState<Label|null>(null),[area,setArea]=useState<ReturnType<typeof selectionRect>|null>(null),[areaIds,setAreaIds]=useState<string[]|null>(null)
 const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),marquee=useRef<Marquee|null>(null),draft=useRef<Label|null>(null)
 const label=preview||design.labels[index],p=design.paper,scale=pixelsPerMm,ids=areaIds??selected
 const group=ids.length>1?selectionBounds(label.objects.filter(o=>ids.includes(o.id))):null
 function focus(){svg.current?.closest<HTMLElement>('.label-canvas-scroll')?.focus({preventScroll:true})}
 function point(e:{clientX:number;clientY:number}){const r=svg.current!.getBoundingClientRect();return {x:(e.clientX-r.left)*p.labelWidth/r.width,y:(e.clientY-r.top)*p.labelHeight/r.height}}
 function start(e:PointerEvent<SVGElement>,o:LabelObject,resize=false){
  if(editing||e.button!==0)return
  e.preventDefault();e.stopPropagation();focus()
  if(!resize)o=hitObject(label,point(e),scale*zoom)??o
  if(e.shiftKey&&!resize){onSelect(selected.includes(o.id)?selected.filter(id=>id!==o.id):[...selected,o.id]);return}
  const toggle=multiSelect&&!resize
  const moving=resize?[o.id]:selected.includes(o.id)?selected:[...(toggle?selected:[]),o.id]
  const tapIds=toggle?(selected.includes(o.id)?selected.filter(id=>id!==o.id):moving):[o.id]
  if(!toggle)onSelect(moving)
  drag.current={pointerId:e.pointerId,threshold:e.pointerType==='touch'?3:0,moved:false,id:o.id,resize,x:e.clientX,y:e.clientY,object:clone(o),label:clone(label),ids:moving,tapIds}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 function startArea(e:PointerEvent<SVGSVGElement>){
  if(editing||e.button!==0||e.pointerType==='touch')return
  e.preventDefault();e.stopPropagation();focus();const at=point(e)
  marquee.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,start:at,end:at,moved:false,base:e.shiftKey?selected:[]}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 function move(e:PointerEvent<SVGSVGElement>){
  const a=marquee.current
  if(a&&a.pointerId===e.pointerId){
   if(!a.moved&&Math.hypot(e.clientX-a.x,e.clientY-a.y)<3)return
   a.moved=true;a.end=point(e);setArea(selectionRect(a.start,a.end));setAreaIds([...new Set([...a.base,...intersectingObjects(design.labels[index],a.start,a.end)])]);return
  }
  const v=drag.current;if(!v||v.pointerId!==e.pointerId)return
  if(!v.moved&&Math.hypot(e.clientX-v.x,e.clientY-v.y)<=v.threshold)return
  v.moved=true;onSelect(v.ids)
  const rect=svg.current!.getBoundingClientRect(),delta=pointerDeltaMm(e.clientX-v.x,e.clientY-v.y,rect.width,rect.height,p.labelWidth,p.labelHeight)
  let n:Label
  if(v.resize){
   n=clone(v.label);const o=n.objects.find(o=>o.id===v.id)!,round=(n:number)=>snap?Math.round(n*2)/2:Math.round(n*100)/100,a=v.object.rotation*Math.PI/180
   let width=Math.max(1,round(v.object.width+delta.x*Math.cos(a)+delta.y*Math.sin(a))),height=Math.max(1,round(v.object.height-delta.x*Math.sin(a)+delta.y*Math.cos(a)))
   if(o.kind==='image'){const ratio=v.object.width/v.object.height;width=Math.min(p.labelWidth-o.x,width);height=width/ratio;if(height>p.labelHeight-o.y){height=p.labelHeight-o.y;width=height*ratio}}
   o.width=Math.min(p.labelWidth-o.x,width);o.height=Math.min(p.labelHeight-o.y,height)
  }else n=moveSelection(v.label,v.ids,delta,p,snap)
  draft.current=n;setPreview(n)
 }
 function reset(){drag.current=null;marquee.current=null;draft.current=null;setPreview(null);setArea(null);setAreaIds(null)}
 function finish(e:PointerEvent<SVGSVGElement>){
  const a=marquee.current,v=drag.current
  if(a?.pointerId===e.pointerId){onSelect(a.moved?[...new Set([...a.base,...intersectingObjects(design.labels[index],a.start,a.end)])]:a.base);reset()}
  else if(v?.pointerId===e.pointerId){if(v.moved&&draft.current)onChange(draft.current);else onSelect(v.tapIds);reset()}
 }
 return <svg ref={svg} className="label-edit-canvas" role="img" aria-label={uiText('라벨 편집 캔버스')} data-label-index={index} width={p.labelWidth*scale} height={p.labelHeight*scale} viewBox={`0 0 ${p.labelWidth} ${p.labelHeight}`} onDragStart={e=>e.preventDefault()} onPointerDown={startArea} onPointerMove={move} onPointerUp={finish} onPointerCancel={reset} onLostPointerCapture={reset}>
  <defs><pattern id="label-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#e5eaf0" strokeWidth=".15"/></pattern></defs><rect width="100%" height="100%" fill="white"/>{snap&&<rect width="100%" height="100%" fill="url(#label-grid)" pointerEvents="none"/>}
  {label.objects.map(o=><g key={o.id}>{editing!==o.id&&<g className="label-object-artwork" pointerEvents="none" dangerouslySetInnerHTML={{__html:renderObject(o,design)}}/>}<g transform={`rotate(${o.rotation} ${o.x+o.width/2} ${o.y+o.height/2})`}>
   <rect data-object-id={o.id} data-selected={ids.includes(o.id)} x={o.x} y={o.y} width={o.width} height={o.height} fill="transparent" stroke="transparent" pointerEvents="all" strokeWidth={o.kind==='line'?12/(scale*zoom):0} onPointerDown={e=>start(e,o)} onDoubleClick={e=>{e.stopPropagation();if(!editing){const target=hitObject(label,point(e),scale*zoom)??o;if(target.kind==='text')onEdit(target.id);else document.getElementById('label-object-text')?.focus()}}} />
   {ids.includes(o.id)&&<rect x={o.x} y={o.y} width={o.width} height={o.height} fill="none" stroke="#16345f" strokeWidth={.3/zoom} pointerEvents="none"/>}
   {ids.length===1&&ids.includes(o.id)&&!editing&&<rect data-resize-handle={o.id} x={o.x+o.width-1.2/zoom} y={o.y+o.height-1.2/zoom} width={2.4/zoom} height={2.4/zoom} fill="#ffda57" stroke="#16345f" strokeWidth={.2/zoom} onPointerDown={e=>start(e,o,true)}/>}
  </g></g>)}
  {group&&!editing&&<rect data-selection-bounds {...group} fill="none" stroke="#16345f" strokeWidth={.3/zoom} strokeDasharray={`${1/zoom} ${1/zoom}`} pointerEvents="none"/>}
  {area&&<rect data-marquee {...area} fill="#3b82f626" stroke="#2563eb" strokeWidth={.25/zoom} pointerEvents="none"/>}
 </svg>
}
