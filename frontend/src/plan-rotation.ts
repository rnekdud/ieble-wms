import { rotation } from './warehouse-plan-model.ts'
import type { PlanDocument, PlanObject } from './warehouse-plan-model.ts'

type Point = { x:number; y:number }
function corners(o:PlanObject, ratio:number):Point[] {
  const angle=o.rotation*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle)
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{
    const x=sx*o.width/2,y=sy*o.height/ratio/2
    return {x:o.x+x*cos-y*sin,y:o.y/ratio+x*sin+y*cos}
  })
}
function overlaps(a:Point[],b:Point[]) {
  return [a,b].every(poly=>poly.every((p,i)=>{
    const q=poly[(i+1)%4],axis={x:-(q.y-p.y),y:q.x-p.x}
    const project=(points:Point[])=>points.map(v=>v.x*axis.x+v.y*axis.y)
    const pa=project(a),pb=project(b)
    return Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))>1e-10
  }))
}
/** Validate only new rotation edits. Existing overlapping zones/aisles and saved layouts stay intact. */
export function rotationChangeError(before:PlanDocument, after:PlanDocument):string|null {
  for(const next of after.objects){
    const old=before.objects.find(o=>o.id===next.id)
    if(!old || rotation(old.rotation)===rotation(next.rotation))continue
    if(!Number.isFinite(next.rotation)||next.rotation < -180||next.rotation>180)return '방향은 -180°부터 180°까지 입력해 주세요.'
    const points=corners(next,after.aspectRatio)
    if(points.some(p=>p.x < -1e-6||p.x>1+1e-6||p.y < -1e-6||p.y>1/after.aspectRatio+1e-6))return '회전 후 객체가 창고 도면 밖으로 나갑니다. 위치나 방향을 조정해 주세요.'
    if(next.type!=='rack'&&next.type!=='wall')continue
    for(const other of after.objects){
      if(other.id===next.id||!['rack','wall'].includes(other.type))continue
      const priorOther=before.objects.find(o=>o.id===other.id)
      if(overlaps(points,corners(other,after.aspectRatio))&&(!priorOther||!overlaps(corners(old,before.aspectRatio),corners(priorOther,before.aspectRatio))))return `회전 후 ${other.label||'다른 랙·벽'}과 겹칩니다. 위치나 방향을 조정해 주세요.`
    }
  }
  return null
}
