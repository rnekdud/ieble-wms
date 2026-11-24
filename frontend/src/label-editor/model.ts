/** Label designs have no warehouse-plan or stock identities. All geometry is in millimetres. */
export type Paper = { id:string; name:string; manufacturer:string; code:string; width:number; height:number; labelWidth:number; labelHeight:number; left:number; top:number; gapX:number; gapY:number; columns:number; rows:number; source?:string }
export type Binding = { productId:string; field:'name'|'code'|'barcode'|'modelNumber'; capturedAt:string }
export type LabelObject = { id:string; kind:'text'|'image'|'barcode'|'rectangle'|'line'; x:number; y:number; width:number; height:number; rotation:number; text:string; font:'sans-serif'|'serif'|'monospace'; fontSize:number; bold:boolean; align:'left'|'center'|'right'; color:string; fill:string; strokeWidth:number; imageId:string; showValue:boolean; binding?:Binding }
export type Label = { objects:LabelObject[] }
export type Design = { schemaVersion:1; paper:Paper; labels:Label[]; images:Record<string,string>; offsetX:number; offsetY:number }
// Official Formtec Word downloads, checked 2026-11-23 (twips / 1440 * 25.4).
// 3105: left408 top895 pitch3743 row2159; 3107: left266 top805 pitch5757 row1919;
// 3108: left266 top782 pitch5757 row2158. Rounded to the manufacturer's 0.1 mm precision.
// Label dimensions are the published product dimensions; column pitch includes the 2.5 mm gap.
const formtec=(code:string,columns:number,rows:number,labelWidth:number,labelHeight:number,left:number,top:number,post:number):Paper=>({id:'formtec-'+code,name:'폼텍 '+code,manufacturer:'폼텍',code,width:210,height:297,labelWidth,labelHeight,left,top,gapX:2.5,gapY:0,columns,rows,source:`https://www.formtec.co.kr/en/bbs/board.php?bo_table=m01_02&wr_id=${post}`})
export const papers:Paper[]=[{id:'a4',name:'A4 일반 용지',manufacturer:'',code:'A4',width:210,height:297,labelWidth:210,labelHeight:297,left:0,top:0,gapX:0,gapY:0,columns:1,rows:1},formtec('3105',3,7,63.5,38.1,7.2,15.8,4),formtec('3107',2,8,99.1,33.9,4.7,14.2,6),formtec('3108',2,7,99.1,38.1,4.7,13.8,7)]
export const perPage=(p:Paper)=>p.columns*p.rows
export const uid=()=>crypto.randomUUID()
export const clone=<T,>(value:T):T=>structuredClone(value)
export function paperError(p:Paper):string|null {
 if(!p.name.trim()||p.name.length>100)return '용지 이름을 입력해 주세요.'
 if(![p.width,p.height,p.labelWidth,p.labelHeight,p.left,p.top,p.gapX,p.gapY,p.columns,p.rows].every(Number.isFinite))return '용지 규격은 숫자로 입력해 주세요.'
 if(p.width<20||p.width>600||p.height<20||p.height>600||p.labelWidth<5||p.labelHeight<5||p.left<0||p.top<0||p.gapX<0||p.gapY<0||!Number.isInteger(p.rows)||!Number.isInteger(p.columns)||p.rows<1||p.columns<1||perPage(p)>100)return '용지 크기·여백·행과 열을 확인해 주세요. 한 장에 최대 100칸입니다.'
 if(p.left+p.columns*p.labelWidth+(p.columns-1)*p.gapX>p.width+.001||p.top+p.rows*p.labelHeight+(p.rows-1)*p.gapY>p.height+.001)return '라벨 배열이 용지 영역을 벗어납니다. 여백·간격·행과 열을 확인해 주세요.'
 return null
}
export function position(p:Paper,index:number){const slot=index%perPage(p);return {page:Math.floor(index/perPage(p)),x:p.left+(slot%p.columns)*(p.labelWidth+p.gapX),y:p.top+Math.floor(slot/p.columns)*(p.labelHeight+p.gapY)}}
export function fresh(p:Paper=papers[2]):Design{return {schemaVersion:1,paper:clone(p),labels:Array.from({length:perPage(p)},()=>({objects:[]})),images:{},offsetX:0,offsetY:0}}
export function newObject(kind:LabelObject['kind'],p:Paper):LabelObject{return {id:uid(),kind,x:2,y:2,width:Math.min(p.labelWidth-4,kind==='barcode'?70:40),height:Math.min(p.labelHeight-4,kind==='line'?1:kind==='text'?10:20),rotation:0,text:kind==='text'?'텍스트':'',font:'sans-serif',fontSize:10,bold:false,align:'left',color:'#16345f',fill:'transparent',strokeWidth:.3,imageId:'',showValue:true}}
export function copyLabel(label:Label):Label{return {objects:label.objects.map(o=>({...clone(o),id:uid()}))}}
export function applyAll(d:Design,index:number):Design {const n=clone(d);n.labels=n.labels.map(()=>copyLabel(d.labels[index]));return n}
export function bounds(o:LabelObject){const a=o.rotation*Math.PI/180,w=Math.abs(o.width*Math.cos(a))+Math.abs(o.height*Math.sin(a)),h=Math.abs(o.width*Math.sin(a))+Math.abs(o.height*Math.cos(a));return {x:o.x+o.width/2-w/2,y:o.y+o.height/2-h/2,width:w,height:h}}
export function outside(o:LabelObject,p:Paper){const b=bounds(o);return b.x<-.01||b.y<-.01||b.x+b.width>p.labelWidth+.01||b.y+b.height>p.labelHeight+.01}
export function changePaper(d:Design,p:Paper):Design {const n=clone(d);n.paper=clone(p);const count=Math.ceil(n.labels.length/perPage(p))*perPage(p);while(n.labels.length<count)n.labels.push({objects:[]});return n}
export function printIndices(d:Design,range:string,selected:number[]|null):number[]{
 const pages=Math.ceil(d.labels.length/perPage(d.paper));let allowed=new Set(Array.from({length:pages},(_,i)=>i+1))
 if(range.trim()) {allowed=new Set();for(const part of range.split(',')){const m=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);if(!m)throw new Error('페이지 범위는 1, 3-5 형식으로 입력해 주세요.');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>pages)throw new Error('페이지 범위를 확인해 주세요.');for(let i=a;i<=b;i++)allowed.add(i)}}
 return d.labels.flatMap((l,i)=>l.objects.length&&allowed.has(Math.floor(i/perPage(d.paper))+1)&&(!selected||selected.includes(i))?[i]:[])
}
export function cleanDesign(d:Design):Design {const n=clone(d);const used=new Set(n.labels.flatMap(l=>l.objects.filter(o=>o.kind==='image').map(o=>o.imageId)));n.images=Object.fromEntries(Object.entries(n.images).filter(([id])=>used.has(id)));return n}
export type History = { past:Design[]; present:Design; future:Design[] }
export const commit=(h:History,d:Design):History=>JSON.stringify(h.present)===JSON.stringify(d)?h:{past:[...h.past.slice(-39),h.present],present:d,future:[]}
export const undo=(h:History):History=>h.past.length?{past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h
export const redo=(h:History):History=>h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h
