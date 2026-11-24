import { t as uiText } from '../../i18n.ts'
import { touchViewport, touchFrame } from '../../touch-viewport'
import type { TouchFrame } from '../../touch-viewport'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Group, Text, Line, Ellipse, Transformer } from 'react-konva'
import Konva from 'konva'
import { rackLabelFont } from '../../dashboard-rack-label'
import PlanRouteOverlay from './PlanRouteOverlay'
import RackDimensionFields from './RackDimensionFields'
import { rackLabelPosition } from '../../rack-label-position'
import type { RackRoute } from '../../barcode-route'
import type { RackLabelInfo } from '../../rack-label-position'
import { fitPlanViewport } from '../../plan-viewport'
import { clamp, movePlanObjects, rotation, round } from '../../warehouse-plan-model'
import type { PlanDocument, PlanType } from '../../warehouse-plan-model'
export type PlanCanvasHandle = { fit: () => void; zoom: (factor: number) => void }
type Props = { route?: RackRoute; onRotationPreview?:(value:{id:string;rotation:number}|null)=>void; editorRackInformation?: Record<string,RackLabelInfo>; structureView?: boolean; onRackDimensionsChange?:(patch:Partial<Pick<RackLabelInfo,'levels'|'bays'>>)=>void; selectedRackInfo?: RackLabelInfo & {objectId:string}; onRackHover?: (id: string | null, x: number, y: number) => void; rackAppearance?: Record<string, { fill: string; label: string; summary?: string }>; document: PlanDocument; editing: boolean; selected: string[]; grid: boolean; snap: boolean; pan: boolean; onSelect: (ids: string[]) => void; onChange: (doc: PlanDocument) => void; onOpenRack: (id: string) => void; onAdd: (type: PlanType, x: number, y: number) => void }
const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas({ route, onRotationPreview, editorRackInformation, structureView = false, onRackDimensionsChange, selectedRackInfo, onRackHover, rackAppearance, document: doc, editing, selected, grid, snap, pan, onSelect, onChange, onOpenRack, onAdd }, ref) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null), transformer = useRef<Konva.Transformer>(null)
  const touch = useRef<{ frame: TouchFrame; view: { x: number; y: number; scale: number } } | null>(null)
  const suppressTap = useRef(false)
  const label = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  const [size, setSize] = useState({ width: 600, height: 520 }), [view, setView] = useState({ x: 24, y: 24, scale: .45 })
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const rotating = useRef(false)
  const drag = useRef<{ doc: PlanDocument; ids: string[]; x: number; y: number } | null>(null)
  const width = 1200, height = width / doc.aspectRatio
  const fit = () => setView(fitPlanViewport(size.width, size.height, doc.aspectRatio))
  const zoom = (factor: number, point = { x: size.width / 2, y: size.height / 2 }) => setView(v => { const scale = clamp(v.scale * factor, .05, 4); return { scale, x: point.x - (point.x - v.x) * scale / v.scale, y: point.y - (point.y - v.y) * scale / v.scale } })
  useImperativeHandle(ref, () => ({ fit, zoom }))
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w < 1 || h < 1) return
      setSize({ width: w, height: h }); setView(fitPlanViewport(w, h, doc.aspectRatio))
    }); observer.observe(host.current!); return () => observer.disconnect()
  }, [height, doc.aspectRatio])
  useLayoutEffect(() => { transformer.current?.nodes(editing && !pan && selected.length === 1 ? selected.map(id => nodes.current.get(id)!).filter(Boolean) : []) }, [selected, editing, pan, doc])
  // Konva's client rect includes rotation, scale, drag position and the stage transform.
  // The DOM overlay remains horizontal and keeps a readable screen-pixel font size.
  function positionLabel() {
    const element=label.current, node=selectedRackInfo&&nodes.current.get(selectedRackInfo.objectId)
    if(!element||!node||!host.current)return
    const placement=rackLabelPosition(node.getClientRect({skipStroke:true,skipShadow:true}),
      {width:host.current.clientWidth,height:host.current.clientHeight},{width:element.offsetWidth,height:element.offsetHeight},onRackDimensionsChange?58:8)
    element.style.visibility=placement?'visible':'hidden'
    if(!placement)return
    element.style.left=`${placement.x}px`;element.style.top=`${placement.y}px`
    element.style.setProperty('--rack-label-anchor',`${placement.anchor}px`)
    element.dataset.below=String(placement.below)
  }
  useLayoutEffect(()=>{
    positionLabel()
    if(!label.current)return
    const observer=new ResizeObserver(positionLabel)
    observer.observe(label.current)
    return ()=>observer.disconnect()
  })
  function pointer() { const point = stage.current?.getPointerPosition(); return point ? { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale } : null }
  function select(id: string, additive: boolean) { onSelect(additive ? selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] : [id]) }
  function dragStart(id: string) {
    const item = doc.objects.find(o => o.id === id)!, ids = selected.includes(id) ? selected : [id]
    onSelect(ids); drag.current = { doc, ids, x: item.x * width, y: item.y * height }
  }
  function dragMove(node: Konva.Group) {
    const d = drag.current; if (!d) return
    const next = movePlanObjects(d.doc, d.ids, (node.x() - d.x) / width, (node.y() - d.y) / height, snap)
    for (const o of next.objects.filter(o => d.ids.includes(o.id))) nodes.current.get(o.id)?.position({ x: o.x * width, y: o.y * height })
  }
  function dragEnd(id: string) {
    const d = drag.current, node = nodes.current.get(id); if (!d || !node) return
    onChange(movePlanObjects(d.doc, d.ids, (node.x() - d.x) / width, (node.y() - d.y) / height, snap)); drag.current = null
  }
  return <div className={`warehouse-plan-canvas ${pan ? 'is-panning' : ''}`} ref={host} style={{ aspectRatio: doc.aspectRatio, touchAction: editing ? undefined : 'none' }} data-view-x={view.x} data-view-y={view.y} data-plan-ratio={doc.aspectRatio} data-route-entrance={route?.entranceId} data-route-points={route ? JSON.stringify(route.points) : undefined} data-view-scale={view.scale} tabIndex={0} aria-label={uiText("창고 2D 도면 캔버스")}
    onPointerDown={() => host.current?.focus({ preventScroll: true })}
    onTouchStartCapture={e => {
      if (editing || !host.current) return
      const bounds = host.current.getBoundingClientRect()
      const frame = touchFrame(Array.from(e.touches).map(t => ({ x: t.clientX - bounds.left, y: t.clientY - bounds.top })))
      if (!frame) return
      if (e.touches.length === 1) suppressTap.current = false
      else suppressTap.current = true
      stage.current?.stopDrag()
      touch.current = { frame, view }
    }}
    onTouchMoveCapture={e => {
      if (editing || !touch.current || !host.current) return
      const bounds = host.current.getBoundingClientRect()
      const frame = touchFrame(Array.from(e.touches).map(t => ({ x: t.clientX - bounds.left, y: t.clientY - bounds.top })))
      if (!frame || frame.count !== touch.current.frame.count) return
      const origin = touch.current
      if (frame.count > 1 || Math.hypot(frame.x - origin.frame.x, frame.y - origin.frame.y) > 5) suppressTap.current = true
      if (!suppressTap.current) return
      stage.current?.stopDrag(); onRackHover?.(null, 0, 0)
      setView(touchViewport(origin.view, origin.frame, frame))
    }}
    onTouchEndCapture={e => {
      if (editing || !host.current) return
      const bounds = host.current.getBoundingClientRect()
      const frame = touchFrame(Array.from(e.touches).map(t => ({ x: t.clientX - bounds.left, y: t.clientY - bounds.top })))
      touch.current = frame ? { frame, view } : null
    }}
    onTouchCancelCapture={() => { touch.current = null; suppressTap.current = true }}
    onDragOver={e => { if (editing) e.preventDefault() }} onDrop={e => { e.preventDefault(); if (!editing) return; const type = e.dataTransfer.getData('application/wms-plan') as PlanType; if (!['wall', 'zone', 'rack', 'aisle', 'door', 'text', 'shape'].includes(type)) return; const r = host.current!.getBoundingClientRect(); onAdd(type, clamp((e.clientX - r.left - view.x) / view.scale / width, 0, 1), clamp((e.clientY - r.top - view.y) / view.scale / height, 0, 1)) }}>
    <Stage ref={stage} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable={pan}
      onDragMove={positionLabel}
      onDragEnd={e => { if (e.target === stage.current) setView(v => ({ ...v, x: e.target.x(), y: e.target.y() })) }}
      onWheel={e => { onRackHover?.(null, 0, 0); if (!e.evt.ctrlKey && !e.evt.metaKey) return; e.evt.preventDefault(); zoom(e.evt.deltaY > 0 ? .9 : 1.1, stage.current?.getPointerPosition() || undefined) }}
      onMouseLeave={() => { onRackHover?.(null, 0, 0); start.current = null; setMarquee(null) }}
      onClick={e => { if (structureView && !editing && !pan && (e.target === stage.current || e.target.name() === 'plan-background')) onSelect([]) }}
      onTap={e => { if (suppressTap.current) return; if (structureView && !editing && !pan && (e.target === stage.current || e.target.name() === 'plan-background')) onSelect([]) }}
      onMouseDown={e => { if (e.evt.button !== 0 || pan || !editing || (e.target !== stage.current && e.target.name() !== 'plan-background')) return; const p = pointer(); if (!p) return; start.current = p; setMarquee({ ...p, width: 0, height: 0 }); if (!e.evt.shiftKey) onSelect([]) }}
      onMouseMove={() => { if (!start.current) return; const p = pointer(); if (p) setMarquee({ x: Math.min(p.x, start.current.x), y: Math.min(p.y, start.current.y), width: Math.abs(p.x - start.current.x), height: Math.abs(p.y - start.current.y) }) }}
      onMouseUp={e => { if (marquee && marquee.width + marquee.height > 5) { const ids = doc.objects.filter(o => Konva.Util.haveIntersection(marquee, nodes.current.get(o.id)!.getClientRect({ relativeTo: stage.current! }))).map(o => o.id); onSelect(e.evt.shiftKey ? [...new Set([...selected, ...ids])] : ids) } start.current = null; setMarquee(null) }}>
      <Layer>
        <Rect name="plan-background" x={0} y={0} width={width} height={height} fill="#fff" stroke="#b8ccc3" strokeWidth={1 / view.scale} />
        {grid && <Group listening={false}>{Array.from({ length: 61 }, (_, i) => <Line key={`x${i}`} points={[i * 20, 0, i * 20, height]} stroke="#e9efec" strokeWidth={.7 / view.scale} />)}{Array.from({ length: Math.floor(height / 20) + 1 }, (_, i) => <Line key={`y${i}`} points={[0, i * 20, width, i * 20]} stroke="#e9efec" strokeWidth={.7 / view.scale} />)}</Group>}
        {doc.objects.map(o => { const w = o.width * width, h = o.height * height, active = selected.includes(o.id), editorRack = o.rackId ? editorRackInformation?.[o.rackId] : undefined, appearance = o.rackId ? rackAppearance?.[o.rackId] : undefined; return <Group key={o.id} id={o.id} name="plan-object" ref={node => { if (node) nodes.current.set(o.id, node); else nodes.current.delete(o.id) }} x={o.x * width} y={o.y * height} rotation={o.rotation} draggable={editing && !pan}
          onMouseMove={e => { if (!editing && !pan && o.rackId) { if (appearance && stage.current) stage.current.container().style.cursor = 'pointer'; onRackHover?.(o.rackId, e.evt.clientX, e.evt.clientY) } }} onMouseLeave={() => { if (appearance && stage.current) stage.current.container().style.cursor = ''; onRackHover?.(null, 0, 0) }}
          onClick={e => { if (pan) return; select(o.id, e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey); if (o.rackId && !editing && !e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) onOpenRack(o.rackId) }} onTap={() => { if (suppressTap.current || (pan && editing)) return; onSelect([o.id]); if (o.rackId && !editing) onOpenRack(o.rackId) }} onDblClick={e => { if (o.rackId && editing && !pan && !e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) onOpenRack(o.rackId) }}
          onDragStart={() => dragStart(o.id)} onDragMove={() => dragMove(nodes.current.get(o.id)!)} onDragEnd={() => dragEnd(o.id)}
          onTransformStart={() => { rotating.current=!!transformer.current?.getActiveAnchor()?.startsWith('rotater') }}
          onTransform={() => { positionLabel();if(rotating.current)onRotationPreview?.({id:o.id,rotation:rotation(nodes.current.get(o.id)!.rotation())}) }}
          onTransformEnd={() => {
            const n=nodes.current.get(o.id)!
            const next=rotating.current?{...o,rotation:rotation(n.rotation())}:{...o,x:round(clamp(n.x()/width,0,1)),y:round(clamp(n.y()/height,0,1)),width:round(clamp(o.width*n.scaleX(),.005,1)),height:round(clamp(o.height*n.scaleY(),.005,1)),rotation:rotation(n.rotation())}
            // Restore before committing: a rejected rotation must not leave a stale Konva transform.
            n.setAttrs({x:o.x*width,y:o.y*height,rotation:o.rotation,scaleX:1,scaleY:1})
            transformer.current?.forceUpdate();rotating.current=false;onRotationPreview?.(null)
            onChange({...doc,objects:doc.objects.map(item=>item.id===o.id?next:item)})
          }}>
          {o.shape === 'ellipse' && o.type === 'shape' ? <Ellipse radiusX={w / 2} radiusY={h / 2} fill={o.fill} stroke={active ? (structureView ? '#16345f' : '#137b6c') : '#6a8177'} strokeWidth={active ? 3 : 1} /> : <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={o.type === 'text' ? 'rgba(255,255,255,0.01)' : appearance?.fill || o.fill} stroke={active ? (structureView ? '#16345f' : '#137b6c') : o.type === 'text' ? undefined : '#6a8177'} strokeWidth={active && route && !editing && o.type === 'rack' ? 1.5 / view.scale : active ? 3 : 1} dash={o.type === 'aisle' ? [8, 5] : undefined} cornerRadius={o.type === 'wall' ? 0 : 3} />}
          {o.type === 'rack' && !appearance && <Group listening={false}>{[1, 2, 3].map(i => <Line key={i} points={[-w / 2 + w * i / 4, -h / 2, -w / 2 + w * i / 4, h / 2]} stroke="#729aac" />)}</Group>}
          {o.type === 'door' && <Line listening={false} points={[-w / 2, h / 2, w / 2, -h / 2]} stroke="#836b4f" strokeWidth={3} />}
          {appearance ? <Group listening={false}>
            {rackLabelFont(appearance.label, w, h, view.scale) > 0 && <Text x={-w / 2 + 4} y={appearance.summary ? -h / 2 + 4 : -h / 2} width={Math.max(1, w - 8)} height={appearance.summary ? h / 2 - 4 : h} text={appearance.label} fontFamily="Noto Sans KR, sans-serif" fontSize={rackLabelFont(appearance.label, w, h, view.scale)} fill="#16345F" align="center" verticalAlign={appearance.summary ? 'bottom' : 'middle'} wrap="none" />}
            {appearance.summary && rackLabelFont(appearance.label, w, h, view.scale) > 0 && rackLabelFont(appearance.summary, w, h, view.scale, 11) > 0 && <Text x={-w / 2 + 4} y={2 / view.scale} width={Math.max(1, w - 8)} height={Math.max(1, h / 2 - 4)} text={appearance.summary} fontFamily="Noto Sans KR, sans-serif" fontSize={Math.min(rackLabelFont(appearance.label, w, h, view.scale), rackLabelFont(appearance.summary, w, h, view.scale, 11))} fill="#24483e" align="center" verticalAlign="top" wrap="none" />}
          </Group> : editorRack ? <Group listening={false} rotation={Math.abs(rotation(o.rotation))>90?180:0} clipX={-w/2} clipY={-h/2} clipWidth={w} clipHeight={h}>
            <Text x={-w/2+4} y={-h/2+4} width={Math.max(1,w-8)} height={Math.max(1,(editorRack.name && editorRack.name !== editorRack.code ? h/2 : h)-8)} text={editorRack.name || editorRack.code} fontSize={Math.max(1,Math.min(16, w/Math.max(1,(editorRack.name||editorRack.code).length),h/3))} fill="#16345F" align="center" verticalAlign="middle" wrap="none" ellipsis/>
            {editorRack.name && editorRack.name !== editorRack.code && <Text x={-w/2+4} y={0} width={Math.max(1,w-8)} height={Math.max(1,h/2-4)} text={editorRack.code} fontSize={Math.max(1,Math.min(12,w/Math.max(1,editorRack.code.length),h/4))} fill="#64748b" align="center" verticalAlign="middle" wrap="none" ellipsis/>}
          </Group> : <Text listening={false} x={-w / 2 + 4} y={-h / 2 + 4} width={Math.max(1, w - 8)} height={Math.max(1, h - 8)} text={o.label} fontFamily="Noto Sans KR, sans-serif" fontSize={o.type === 'text' ? 24 : 16} fill={o.type === 'text' ? o.fill : o.type === 'wall' ? '#ffffff' : '#24483e'} align={structureView && o.type === 'zone' ? 'left' : 'center'} verticalAlign={structureView && o.type === 'zone' ? 'top' : 'middle'} lineHeight={1} ellipsis /> }
        </Group> })}
        <Transformer ref={transformer} flipEnabled={false} rotateEnabled rotateAnchorOffset={36} rotateAnchorCursor="grab" anchorSize={10} borderStroke="#16345f" anchorStroke="#16345f" anchorStyleFunc={anchor=>{if(anchor.hasName('rotater'))anchor.setAttrs({width:22,height:22,offsetX:11,offsetY:11,cornerRadius:11,fill:'#ffc83d',stroke:'#16345f',strokeWidth:2})}} keepRatio={false} boundBoxFunc={(old, next) => Math.abs(next.width) < 6 || Math.abs(next.height) < 6 ? old : next} />
        {marquee && <Rect {...marquee} fill="rgba(20,120,95,.12)" stroke="#137b6c" listening={false} />}
      </Layer>
      {!editing && route && <PlanRouteOverlay route={route} document={doc} scale={view.scale} />}
    </Stage>
    {selectedRackInfo && <div ref={label} className={`rack-floating-label ${onRackDimensionsChange?'rack-floating-editor':''}`} role={onRackDimensionsChange?'group':'status'} aria-label={onRackDimensionsChange ? uiText("랙 빠른 편집") : undefined} data-object-id={selectedRackInfo.objectId}
      onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.preventDefault()}}>
      <strong>{selectedRackInfo.code || uiText("코드 미입력")}</strong>
      {onRackDimensionsChange ? <><div className="rack-floating-inputs"><RackDimensionFields key={selectedRackInfo.objectId} value={selectedRackInfo} prefix="플로팅 랙" disabled={!editing} onChange={onRackDimensionsChange}/></div><small className="rack-floating-count">{selectedRackInfo.levels&&selectedRackInfo.bays ? uiText("보관 위치 {v0}개 · 최종 저장 시 반영", { v0: selectedRackInfo.levels*selectedRackInfo.bays }) : uiText("단수·칸수 확인 필요")}</small></> : <><span aria-hidden="true"> · </span><span>{selectedRackInfo.levels || '—'}{uiText("단 ×")} {selectedRackInfo.bays || '—'}{uiText("칸")}</span></>}
    </div>}
    {editing && !pan && selected.length===1 && <span className="plan-rotation-hint">{uiText("원형 핸들을 끌어 회전")}</span>}
    <span className="warehouse-plan-scale">{Math.round(view.scale * 100)}% · {pan ? uiText("화면 이동") : editing ? uiText("객체 선택") : uiText("조회")}</span>
  </div>
})
export default PlanCanvas
