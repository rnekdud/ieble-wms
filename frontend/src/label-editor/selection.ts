import { bounds } from './model.ts'
import type { Label, LabelObject, Paper } from './model.ts'
import type { Point } from './viewport'

export function selectionBounds(objects: LabelObject[]) {
  if (!objects.length) return null
  const boxes = objects.map(bounds), x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y))
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y }
}
export function selectionRect(a: Point, b: Point) { return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) } }
type Rect = ReturnType<typeof selectionRect>
const epsilon = 1e-9
function worldPoint(o: LabelObject, x: number, y: number): Point {
  const angle = o.rotation*Math.PI/180, dx = x-o.width/2, dy = y-o.height/2
  return { x:o.x+o.width/2+dx*Math.cos(angle)-dy*Math.sin(angle), y:o.y+o.height/2+dx*Math.sin(angle)+dy*Math.cos(angle) }
}
function corners(r: Rect) { return [{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}] }
/** SAT checks the rotated rectangle itself, not the empty corners of its axis-aligned bounds. */
function intersectsBox(o: LabelObject, local: Rect, selection: Rect) {
  const polygon = corners(local).map(p=>worldPoint(o,p.x,p.y)), query = corners(selection)
  const axes = [{x:1,y:0},{x:0,y:1},...polygon.slice(0,2).map((p,i)=>({x:polygon[i+1].y-p.y,y:p.x-polygon[i+1].x}))]
  return axes.every(axis=>{
    const a=polygon.map(p=>p.x*axis.x+p.y*axis.y),b=query.map(p=>p.x*axis.x+p.y*axis.y)
    return Math.max(...a)+epsilon>=Math.min(...b)&&Math.max(...b)+epsilon>=Math.min(...a)
  })
}
/** Slab clipping includes endpoints and works in every drag/line direction. No click-hit padding. */
function intersectsSegment(a: Point,b: Point,r: Rect) {
  let low=0,high=1
  for(const key of ['x','y'] as const){
    const delta=b[key]-a[key],min=r[key],max=min+(key==='x'?r.width:r.height)
    if(Math.abs(delta)<epsilon){if(a[key]<min-epsilon||a[key]>max+epsilon)return false;continue}
    const first=(min-a[key])/delta,last=(max-a[key])/delta
    low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last))
    if(low>high+epsilon)return false
  }
  return true
}
export function intersectingObjects(label: Label, a: Point, b: Point) {
  const r=selectionRect(a,b)
  return label.objects.filter(o=>{
    const q=bounds(o)
    if(q.x>r.x+r.width+epsilon||q.y>r.y+r.height+epsilon||q.x+q.width<r.x-epsilon||q.y+q.height<r.y-epsilon)return false
    if(o.kind==='line')return intersectsSegment(worldPoint(o,0,o.height/2),worldPoint(o,o.width,o.height/2),r)
    if(o.kind==='rectangle'&&o.fill==='transparent'){
      const s=Math.min(o.strokeWidth,o.width/2,o.height/2)
      if(s<=0)return false
      return [{x:0,y:0,width:o.width,height:s},{x:0,y:o.height-s,width:o.width,height:s},
        {x:0,y:s,width:s,height:o.height-2*s},{x:o.width-s,y:s,width:s,height:o.height-2*s}].some(strip=>intersectsBox(o,strip,r))
    }
    return intersectsBox(o,{x:0,y:0,width:o.width,height:o.height},r)
  }).map(o=>o.id)
}
/** One common millimetre delta preserves spacing, including off-grid objects and rotation. */
export function moveSelection(label: Label, ids: string[], delta: Point, paper: Paper, snap: boolean): Label {
  const objects = label.objects.filter(o => ids.includes(o.id)), box = selectionBounds(objects)
  if (!box) return label
  const anchor = objects[0], round = (n: number) => snap ? Math.round(n*2)/2 : Math.round(n*100)/100
  const clamp = (n: number, low: number, high: number) => low > high ? 0 : Math.max(low,Math.min(high,n))
  const dx = clamp(round(anchor.x+delta.x)-anchor.x,-box.x,paper.labelWidth-box.x-box.width)
  const dy = clamp(round(anchor.y+delta.y)-anchor.y,-box.y,paper.labelHeight-box.y-box.height)
  return { objects: label.objects.map(o => ids.includes(o.id) ? {...o,x:o.x+dx,y:o.y+dy} : o) }
}

/** Resolve visual stacking in label mm, independently of nested barcode/image SVG nodes.
 * A transparent frame's interior may expose another object; its border still selects the frame.
 * Screen-sized hit padding is editor-only and never affects selection bounds or saved geometry. */
export function hitObject(label: Label, point: Point, pixelsPerMillimetre: number) {
  let frame: LabelObject | undefined
  for (const o of [...label.objects].reverse()) {
    const angle = -o.rotation*Math.PI/180, dx = point.x-o.x-o.width/2, dy = point.y-o.y-o.height/2
    const x = dx*Math.cos(angle)-dy*Math.sin(angle)+o.width/2, y = dx*Math.sin(angle)+dy*Math.cos(angle)+o.height/2
    const padding = o.kind === 'line' ? 6/pixelsPerMillimetre : 0
    if (x < -padding || y < -padding || x > o.width+padding || y > o.height+padding) continue
    if (o.kind === 'rectangle' && o.fill === 'transparent') {
      const edge = Math.max(o.strokeWidth,4/pixelsPerMillimetre)
      if (x > edge && y > edge && x < o.width-edge && y < o.height-edge) { if (!frame || o.width*o.height < frame.width*frame.height) frame = o; continue }
    }
    return o
  }
  return frame
}
