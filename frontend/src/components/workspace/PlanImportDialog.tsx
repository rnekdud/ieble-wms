import { RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import FormLabel from '../FormLabel'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { api } from '../../api'
import { blankPlan, createPlanObject, editPlan, planColors, planLabels } from '../../warehouse-plan-model'
import type { PlanHistory, PlanType } from '../../warehouse-plan-model'
import { importFileError, importTemplate } from '../../plan-import-model'
import type { ImportCandidate, ImportJob, ImportRack } from '../../plan-import-model'
import type { TemplateDocument } from '../../warehouse-templates'
import OrganizationDialog from './OrganizationDialog'
import PlanEditorSurface from './PlanEditorSurface'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import './plan-import.css'

const evidence:Record<string,string>={'observed-boundary-stroke':'끊어진 외곽의 실제 선분','boundary-framed-opening':'외벽과 연결된 출입 공간 후보','outer-boundary-line':'외곽 경계선','interior-rack-outline':'외벽 내부 사각 윤곽','long-line':'긴 선분','repeated-elongated-rectangles':'반복된 직사각 배치','unclassified-rectangle':'유형 미확인 사각형','free-strip-between-racks':'랙 사이 빈 공간','gap-between-wall-segments':'벽 선분 사이 틈','bounded-color-region':'색상으로 구획된 영역'}
export default function PlanImportDialog({endpoint,onApply,onClose}:{endpoint:string;onApply:(doc:TemplateDocument)=>void;onClose:()=>void}) {
  const [job,setJob]=useState<ImportJob>(),[uploading,setUploading]=useState(false),[requesting,setRequesting]=useState(false),[error,setError]=useState(''),[drag,setDrag]=useState(false)
  const [history,setHistory]=useState<PlanHistory>({past:[],present:blankPlan(),future:[]}),[selected,setSelected]=useState<string[]>([])
  const [racks,setRacks]=useState<Record<string,ImportRack>>({}),[confirmed,setConfirmed]=useState(false),[reset,setReset]=useState<'close'|'analyze'|File|{page:number;rotation:number}>()
  const [manual,setManual]=useState(false),[overlay,setOverlay]=useState(true)
  const [sourceTool,setSourceTool]=useState<'rack'|'door'>(),[sourceDrag,setSourceDrag]=useState<{x:number;y:number;endX:number;endY:number}>()
  const sourceStart=useRef<{x:number;y:number}|undefined>(undefined)
  const [candidates,setCandidates]=useState<Record<string,ImportCandidate>>({})
  const liveJob=useRef<string|undefined>(undefined),mounted=useRef(true),sequence=useRef(0)
  const working=uploading||requesting||!!job&&['Inspecting','Rendering','Analyzing'].includes(job.status),guard=useUnsavedNavigation(!!job,working)
  function receive(next:ImportJob){
    setJob(next)
    if(next?.status!=='Completed'||!next.result)return
    const items=next.result.candidates, rackItems=items.filter(c=>c.object.type==='rack')
    setHistory({past:[],present:{schemaVersion:1,aspectRatio:next.result.aspectRatio,objects:items.map((c,i)=>({...c.object,rackId:c.object.type==='rack'?c.object.id:null,label:c.object.type==='rack'?`랙 ${rackItems.indexOf(c)+1}`:`${planLabels[c.object.type]} 후보 ${i+1}`}))},future:[]})
    setCandidates(Object.fromEntries(items.map(c=>[c.object.id,c])))
    setRacks(Object.fromEntries(rackItems.map((c,i)=>[c.object.id,{name:`랙 ${i+1}`,code:`R-${String(i+1).padStart(2,'0')}`,levels:0,bays:0}])))
    setConfirmed(false);setSelected([]);setManual(false);setSourceTool(undefined);sourceStart.current=undefined;setSourceDrag(undefined)
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(liveJob.current)void api(`${endpoint}/${liveJob.current}/discard`,{}).catch(()=>{})}},[endpoint])
  useEffect(()=>{if(!job||!['Inspecting','Rendering','Analyzing'].includes(job.status))return;let live=true;const timer=setTimeout(()=>{api<ImportJob>(`${endpoint}/${job.id}`).then(next=>{if(live)receive(next)}).catch(e=>{if(live){setError(e.message);setJob(current=>current?{...current,status:'Failed'}:current)}})},600);return()=>{live=false;clearTimeout(timer)}},[endpoint,job])
  async function upload(file:File) {
    const problem=importFileError(file);if(problem){setError(problem);return}
    const version=++sequence.current;setUploading(true);setError('');setReset(undefined)
    try {if(liveJob.current)await api(`${endpoint}/${liveJob.current}/discard`,{});liveJob.current=undefined;setManual(false);setSourceTool(undefined);sourceStart.current=undefined;setSourceDrag(undefined);setJob(undefined);setHistory({past:[],present:blankPlan(),future:[]});const form=new FormData();form.append('file',file);const next=await api<ImportJob>(endpoint,form);if(!mounted.current||version!==sequence.current){void api(`${endpoint}/${next.id}/discard`,{});return}liveJob.current=next.id;setJob(next)}catch(e){if(mounted.current)setError((e as Error).message)}finally{if(mounted.current)setUploading(false)}
  }
  function choose(file?:File){if(!file||working)return;const issue=importFileError(file);if(issue){setError(issue);return}if(job)setReset(file);else void upload(file)}
  async function action(kind:'page'|'analyze',body:object={}) {if(!job||working)return;setRequesting(true);setError('');setReset(undefined);try {const next=await api<ImportJob>(`${endpoint}/${job.id}/${kind}`,body);setJob(next);setManual(false);setSourceTool(undefined);setHistory({past:[],present:blankPlan(),future:[]});setCandidates({});setRacks({});setSelected([]);setConfirmed(false)}catch(e){setError((e as Error).message)}finally{setRequesting(false)}}
  function pageChange(page:number,rotation:number){if(objects.length)setReset({page,rotation});else void action('page',{page,rotation})}
  function close(){guard.saved();onClose()}
  const objects=history.present.objects,rs=objects.filter(o=>o.type==='rack'),counts=Object.keys(planLabels).map(type=>({type:type as PlanType,count:objects.filter(o=>o.type===type).length}))
  function rackValue(id:string):ImportRack{return racks[id]||{name:objects.find(o=>o.id===id)?.label||'랙 이름 확인',code:`R-${id.slice(0,8).toUpperCase()}`,levels:0,bays:0}}
  function rackChange(id:string,patch:Partial<ImportRack>){setError('');setRacks(current=>({...current,[id]:{...rackValue(id),...patch}}));setConfirmed(false)}
  function startManual(){setManual(true);setHistory({past:[],present:{...blankPlan(),aspectRatio:job?.metadata?.aspectRatio||1.6},future:[]});setCandidates({});setRacks({});setSelected([]);setConfirmed(false)}
  const editablePreview=job?.status==='Completed'||manual
  const reviewIssues=editablePreview ? [objects.filter(o=>o.type==='wall').length<3?'외벽 주요 구조를 확인하세요.':'',!rs.length?'랙 후보가 없습니다. 누락된 랙을 원본에서 지정하세요.':'',!objects.some(o=>o.type==='door')?'출입구 후보가 없습니다. 원본의 개방 위치를 확인하세요.':''].filter(Boolean) : []
  function sourcePoint(e:PointerEvent<HTMLDivElement>){const b=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-b.x)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.y)/b.height))}}
  function sourceDown(e:PointerEvent<HTMLDivElement>){if(!sourceTool||working||!editablePreview||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const p=sourcePoint(e);sourceStart.current=p;setSourceDrag({...p,endX:p.x,endY:p.y})}
  function sourceMove(e:PointerEvent<HTMLDivElement>){if(!sourceStart.current)return;const p=sourcePoint(e);setSourceDrag({...sourceStart.current,endX:p.x,endY:p.y})}
  function sourceUp(e:PointerEvent<HTMLDivElement>){
    const a=sourceStart.current;sourceStart.current=undefined;setSourceDrag(undefined);if(!a||!sourceTool||working)return
    const b=sourcePoint(e);if(sourceTool==='rack'&&(Math.abs(a.x-b.x)<.01||Math.abs(a.y-b.y)<.01))return
    if(objects.length>=450){setError('객체가 많습니다. 불필요한 후보를 삭제한 뒤 추가하세요.');return}
    const id=crypto.randomUUID(),object=createPlanObject(sourceTool,id,sourceTool==='rack'?(a.x+b.x)/2:b.x,sourceTool==='rack'?(a.y+b.y)/2:b.y)
    if(sourceTool==='rack'){object.width=Math.abs(a.x-b.x);object.height=Math.abs(a.y-b.y);object.rackId=id;object.label='랙 이름 확인'}
    else{object.width=.08;object.height=.025;object.x=Math.max(.04,Math.min(.96,object.x));object.y=Math.max(.0125,Math.min(.9875,object.y))}
    setHistory(current=>editPlan(current,{...current.present,objects:[...current.present.objects,object]}));setSelected([id]);setConfirmed(false);setError('');setSourceTool(undefined)
  }
  function apply(){try{if(!confirmed)throw Error('원본과 인식 후보를 비교해 확인해 주세요.');const doc=importTemplate(history.present,Object.fromEntries(rs.map(o=>[o.id,rackValue(o.id)])));guard.saved();onApply(doc)}catch(e){setError((e as Error).message)}}
  return <OrganizationDialog title="도면 파일 불러오기" size="large" onClose={()=>job?setReset('close'):close()} actions={<div className="plan-import-footer">
      {(error||job?.error)&&<p role="alert" className="alert error">{error||job?.error}</p>}
      <div className="plan-import-action-row">
        {editablePreview&&<label className="organization-checkbox plan-import-confirm"><input aria-label={"원본과 후보의 위치·유형·누락 및 랙 설정을 확인했습니다."} aria-required="true" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /><FormLabel required>원본과 후보의 위치·유형·누락 및 랙 설정을 확인했습니다.</FormLabel></label>}
        <button type="button" className="secondary" onClick={()=>job?setReset('close'):close()}>취소</button><button type="button" className="primary" disabled={working||!editablePreview||!objects.length||!confirmed} onClick={apply}>에디터에 적용</button>
      </div>
    </div>}>
    <div className={`plan-import ${job?.metadata ? 'has-preview' : 'is-upload'}`}>
      <p className="organization-help">로컬 분석 · 외부 AI/OCR 미연동 · 파일은 외부로 전송하지 않으며 닫거나 업로드 30분 후 삭제합니다.</p>
      <div className={`plan-import-upload ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);choose(e.dataTransfer.files[0])}}>
        <label><FormLabel required={!job}>PDF·이미지 파일</FormLabel><input aria-required={!job} aria-label="도면 파일" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={working} onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}} /></label><span>{job?.fileName||'파일을 선택하거나 여기에 놓으세요.'}<small>최대 20MB · PDF 30페이지 · 이미지 4천만 화소</small></span>
      </div>
      {working&&<div role="status"><progress aria-label="도면 처리 진행" />{uploading?'파일 업로드 중…':job?.status==='Analyzing'?'조명·외곽 경계·내부 사각형을 분석 중…':'페이지 미리보기 준비 중…'}</div>}
      {job?.metadata&&<><div className="plan-import-controls"><label>PDF 페이지<select aria-label="도면 페이지" disabled={working} value={job.page} onChange={e=>pageChange(Number(e.target.value),job.rotation)}>{Array.from({length:job.metadata.pageCount},(_,i)=><option key={i} value={i}>{i+1}페이지</option>)}</select></label><label>이미지 방향<select aria-label="도면 방향" disabled={working} value={job.rotation} onChange={e=>pageChange(job.page,Number(e.target.value))}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label><div className="plan-import-rotation" role="group" aria-label="이미지 회전"><button type="button" className="secondary" aria-label="왼쪽 90도 회전" title="왼쪽 90°" disabled={working} onClick={()=>pageChange(job.page,(job.rotation+270)%360)}><RotateCcw size={16}/></button><button type="button" className="secondary" aria-label="오른쪽 90도 회전" title="오른쪽 90°" disabled={working} onClick={()=>pageChange(job.page,(job.rotation+90)%360)}><RotateCw size={16}/></button><button type="button" className="secondary" aria-label="원본 방향 복원" title="원본 방향 복원" disabled={working||job.rotation===0} onClick={()=>pageChange(job.page,0)}><Undo2 size={16}/></button></div><span>{job.metadata.width} × {job.metadata.height}px · 비율 {job.metadata.aspectRatio.toFixed(2)}:1</span><button type="button" className="primary" disabled={working} onClick={()=>objects.length?setReset('analyze'):void action('analyze')}>{job.result?'다시 분석':'분석 시작'}</button>{!editablePreview&&<button type="button" className="secondary" disabled={working} onClick={startManual}>직접 편집</button>}</div>
      {job.metadata.warnings.map(w=><p className="organization-help" key={w}>{w}</p>)}
      <div className="plan-import-compare"><figure><figcaption>보정 미리보기 · 원본과 배치 비교</figcaption>{job.status==='Rendering'?<p role="status">선택한 페이지를 준비하고 있습니다…</p>:<div className={`plan-import-overlay ${sourceTool?'is-marking':''}`} style={{aspectRatio:job.metadata.aspectRatio,'--plan-preview-ratio':job.metadata.aspectRatio} as CSSProperties} aria-label="원본 위 객체 지정" onPointerDown={sourceDown} onPointerMove={sourceMove} onPointerUp={sourceUp} onPointerCancel={()=>{sourceStart.current=undefined;setSourceDrag(undefined)}}><img alt="업로드 도면 원본 미리보기" src={`${endpoint}/${job.id}/preview?v=${job.revision}`} />{editablePreview&&(overlay||sourceTool)&&<svg viewBox={`0 0 ${job.metadata.width} ${job.metadata.height}`} aria-label="인식 결과 겹쳐보기">{objects.map(o=><rect key={o.id} data-kind={o.type} x={-o.width*job.metadata!.width/2} y={-o.height*job.metadata!.height/2} width={o.width*job.metadata!.width} height={o.height*job.metadata!.height} transform={`translate(${o.x*job.metadata!.width} ${o.y*job.metadata!.height}) rotate(${o.rotation})`} fill={o.type==='wall'?'#374151':o.type==='rack'?'#3182ce':o.type==='door'?'#238568':o.fill} fillOpacity={.22} stroke={o.type==='wall'?'#374151':o.type==='rack'?'#3182ce':o.type==='door'?'#238568':'#a66b16'} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={candidates[o.id]?.confidence<.6?'5 3':undefined} />)}{sourceDrag&&sourceTool==='rack'&&<rect x={Math.min(sourceDrag.x,sourceDrag.endX)*job.metadata.width} y={Math.min(sourceDrag.y,sourceDrag.endY)*job.metadata.height} width={Math.abs(sourceDrag.endX-sourceDrag.x)*job.metadata.width} height={Math.abs(sourceDrag.endY-sourceDrag.y)*job.metadata.height} fill="#3182ce" fillOpacity={.15} stroke="#3182ce" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="5 3"/>}</svg>}</div>}{editablePreview&&<label className="organization-checkbox"><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>인식 결과 겹쳐보기</label>}{editablePreview&&<div className="plan-import-source-tools"><button type="button" className="secondary" aria-pressed={sourceTool==='rack'} disabled={working} onClick={()=>{setOverlay(true);setSourceTool(sourceTool==='rack'?undefined:'rack')}}>원본에서 랙 지정</button><button type="button" className="secondary" aria-pressed={sourceTool==='door'} disabled={working} onClick={()=>{setOverlay(true);setSourceTool(sourceTool==='door'?undefined:'door')}}>원본에서 출입구 지정</button><p role="status">{sourceTool==='rack'?'원본의 랙 영역을 드래그하세요.':sourceTool==='door'?'원본의 출입구 위치를 클릭하세요.':'누락된 객체를 원본에서 지정한 뒤 편집 도면에서 크기·방향을 조정할 수 있습니다.'}</p></div>}</figure><section aria-label="변환된 편집 도면"><h3>편집 가능한 인식 후보</h3>{editablePreview?<>
        {!!reviewIssues.length&&<div role="status" className="plan-import-review-warning"><strong>부분 인식 · 확인 필요</strong>{reviewIssues.map(issue=><p key={issue}>{issue}</p>)}</div>}
        <div className="plan-import-counts">{counts.map(c=><span key={c.type}>{planLabels[c.type]} {c.count}개</span>)}<strong>확인 필요 {confirmed?0:objects.length}개</strong></div>
        <label className="plan-import-object-picker">객체 선택<select aria-label="인식 객체 선택" value={selected[0]||''} onChange={e=>setSelected(e.target.value?[e.target.value]:[])}><option value="">편집할 객체 선택</option>{objects.map(o=><option key={o.id} value={o.id}>{o.label||planLabels[o.type]}</option>)}</select></label>
        <details><summary>인식 한계와 확인 사항</summary>{job.result?.warnings.map(w=><p key={w}>{w}</p>)}<p>랙 이름·코드는 손글씨 판독 결과가 아닌 임시 제안값입니다. 단수·칸수는 인식하지 않으며, 아래 또는 랙 상단 편집에서 직접 설정해야 합니다.</p></details>
        <PlanEditorSurface history={history} onHistory={next=>{setError('');setHistory(next);setConfirmed(false)}} selected={selected} onSelect={setSelected} editable={!working} onOpenRack={()=>{}} onAddObject={o=>({...o,rackId:o.type==='rack'?o.id:null})} rackInformation={Object.fromEntries(rs.map(o=>[o.id,rackValue(o.id)]))} onRackDimensionsChange={(id,patch)=>rackChange(id,patch)} customRackProperties transientLinks renderProperties={(o,update)=><>
          <label>객체 유형<select aria-label="인식 객체 유형" value={o.type} onChange={e=>{const type=e.target.value as PlanType;update({type,fill:planColors[type],rackId:type==='rack'?o.id:null})}}>{Object.entries(planLabels).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select></label>
          <p className="plan-import-confidence">{candidates[o.id]?`${evidence[candidates[o.id].evidence]||'기하학 후보'} · ${candidates[o.id].confidence>=.6?'보통':'낮은'} 확신 · 확인 필요`:'직접 추가한 객체'}</p>
          {o.type==='rack'&&<><label>랙 이름 (확인 후 수정)<input aria-label="인식 랙 이름" value={rackValue(o.id).name||''} maxLength={200} onChange={e=>{rackChange(o.id,{name:e.target.value});update({label:e.target.value})}}/></label><label><FormLabel required>랙 코드</FormLabel><input aria-required="true" aria-label="인식 랙 코드" value={rackValue(o.id).code} maxLength={32} onChange={e=>rackChange(o.id,{code:e.target.value.toUpperCase()})}/></label>{(['levels','bays'] as const).map(k=><label key={k}><FormLabel required>{k==='levels'?'랙 단수':'랙 칸수'}</FormLabel><input aria-required="true" aria-label={k==='levels'?'인식 랙 단수':'인식 랙 칸수'} type="number" min={1} max={100} value={rackValue(o.id)[k]||''} placeholder="직접 확인" onChange={e=>rackChange(o.id,{[k]:Number(e.target.value)})}/></label>)}<label>랙 회전<input aria-label="인식 랙 회전" type="number" min={-180} max={180} value={o.rotation} onChange={e=>{if(e.target.validity.valid&&e.target.value)update({rotation:Number(e.target.value)})}}/></label></>}
        </>} />
        {!!rs.length&&<details className="plan-import-racks"><summary>랙 설정 확인 · {rs.filter(o=>!rackValue(o.id).levels||!rackValue(o.id).bays).length}개 미확인</summary><div className="table-scroll"><table className="organization-table"><thead><tr><th><FormLabel required>랙 코드 (임시)</FormLabel></th><th><FormLabel required>단수 (직접 입력)</FormLabel></th><th><FormLabel required>칸수 (직접 입력)</FormLabel></th><th>도면 확인</th></tr></thead><tbody>{rs.map((o,i)=><tr key={o.id}><td><input aria-required="true" aria-label={`랙 ${i+1} 코드`} value={rackValue(o.id).code} maxLength={32} onChange={e=>rackChange(o.id,{code:e.target.value.toUpperCase()})}/></td>{(['levels','bays'] as const).map(k=><td key={k}><input aria-required="true" aria-label={`랙 ${i+1} ${k==='levels'?'단수':'칸수'}`} type="number" min={1} max={100} value={rackValue(o.id)[k]||''} onChange={e=>rackChange(o.id,{[k]:Number(e.target.value)})}/></td>)}<td><button type="button" className="secondary" onClick={()=>setSelected([o.id])}>선택</button></td></tr>)}</tbody></table></div></details>}
      </>:<p>선택한 페이지를 분석하면 기존 2D 에디터에서 결과를 확인할 수 있습니다.</p>}</section></div></>}
    </div>
    {reset&&<OrganizationDialog confirmation title="현재 분석 작업 확인" size="small" onClose={()=>setReset(undefined)}><p>{reset==='close'?'분석 파일과 저장하지 않은 후보 편집을 닫습니다. 기존 창고 도면은 유지됩니다.':'현재 후보 편집을 버리고 파일을 다시 처리합니다. 기존 창고 도면은 아직 변경되지 않습니다.'}</p><div className="dialog-actions"><button type="button" className="secondary" onClick={()=>setReset(undefined)}>계속 편집</button><button type="button" className="primary" onClick={()=>reset==='close'?close():reset==='analyze'?void action('analyze'):reset instanceof File?void upload(reset):void action('page',reset)}>변경 버리고 계속</button></div></OrganizationDialog>}
    <UnsavedChangesDialog guard={guard}/>
  </OrganizationDialog>
}
