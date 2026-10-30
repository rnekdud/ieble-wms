import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Group, Text, Line, Ellipse, Transformer } from 'react-konva'
import Konva from 'konva'
import { clamp, movePlanObjects, rotation, round } from '../../warehouse-plan-model'
import type { PlanDocument, PlanType } from '../../warehouse-plan-model'
export type PlanCanvasHandle = { fit: () => void; zoom: (factor: number) => void }
type Props = { document: PlanDocument; editing: boolean; selected: string[]; grid: boolean; snap: boolean; pan: boolean; onSelect: (ids: string[]) => void; onChange: (doc: PlanDocument) => void; onOpenRack: (id: string) => void; onAdd: (type: PlanType, x: number, y: number) => void }
const PlanCanvas = forwardRef<PlanCanvasHandle, Props>(function PlanCanvas({ document: doc, editing, selected, grid, snap, pan, onSelect, onChange, onOpenRack, onAdd }, ref) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null), transformer = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  const [size, setSize] = useState({ width: 600, height: 520 }), [view, setView] = useState({ x: 24, y: 24, scale: .45 })
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const drag = useRef<{ doc: PlanDocument; ids: string[]; x: number; y: number } | null>(null)
  const width = 1200, height = width / doc.aspectRatio
  const fit = () => { const scale = Math.min((size.width - 48) / width, (size.height - 48) / height); setView({ x: (size.width - width * scale) / 2, y: (size.height - height * scale) / 2, scale }) }
  const zoom = (factor: number, point = { x: size.width / 2, y: size.height / 2 }) => setView(v => { const scale = clamp(v.scale * factor, .05, 4); return { scale, x: point.x - (point.x - v.x) * scale / v.scale, y: point.y - (point.y - v.y) * scale / v.scale } })
  useImperativeHandle(ref, () => ({ fit, zoom }))
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w < 1 || h < 1) return
      const scale = Math.min((w - 48) / width, (h - 48) / height)
      setSize({ width: w, height: h }); setView({ x: (w - width * scale) / 2, y: (h - height * scale) / 2, scale })
    }); observer.observe(host.current!); return () => observer.disconnect()
  }, [height])
  useLayoutEffect(() => { transformer.current?.nodes(editing && !pan && selected.length === 1 ? selected.map(id => nodes.current.get(id)!).filter(Boolean) : []) }, [selected, editing, pan, doc])
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
  return <div className={`warehouse-plan-canvas ${pan ? 'is-panning' : ''}`} ref={host} tabIndex={0} aria-label="창고 2D 도면 캔버스"
    onDragOver={e => { if (editing) e.preventDefault() }} onDrop={e => { e.preventDefault(); if (!editing) return; const type = e.dataTransfer.getData('application/wms-plan') as PlanType; if (!['wall', 'zone', 'rack', 'aisle', 'door', 'text', 'shape'].includes(type)) return; const r = host.current!.getBoundingClientRect(); onAdd(type, clamp((e.clientX - r.left - view.x) / view.scale / width, 0, 1), clamp((e.clientY - r.top - view.y) / view.scale / height, 0, 1)) }}>
    <Stage ref={stage} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable={pan}
      onDragEnd={e => { if (e.target === stage.current) setView(v => ({ ...v, x: e.target.x(), y: e.target.y() })) }}
      onWheel={e => { if (!e.evt.ctrlKey && !e.evt.metaKey) return; e.evt.preventDefault(); zoom(e.evt.deltaY > 0 ? .9 : 1.1, stage.current?.getPointerPosition() || undefined) }}
      onMouseLeave={() => { start.current = null; setMarquee(null) }}
      onMouseDown={e => { if (e.evt.button !== 0 || pan || !editing || (e.target !== stage.current && e.target.name() !== 'plan-background')) return; const p = pointer(); if (!p) return; start.current = p; setMarquee({ ...p, width: 0, height: 0 }); if (!e.evt.shiftKey) onSelect([]) }}
      onMouseMove={() => { if (!start.current) return; const p = pointer(); if (p) setMarquee({ x: Math.min(p.x, start.current.x), y: Math.min(p.y, start.current.y), width: Math.abs(p.x - start.current.x), height: Math.abs(p.y - start.current.y) }) }}
      onMouseUp={e => { if (marquee && marquee.width + marquee.height > 5) { const ids = doc.objects.filter(o => Konva.Util.haveIntersection(marquee, nodes.current.get(o.id)!.getClientRect({ relativeTo: stage.current! }))).map(o => o.id); onSelect(e.evt.shiftKey ? [...new Set([...selected, ...ids])] : ids) } start.current = null; setMarquee(null) }}>
      <Layer>
        <Rect name="plan-background" x={0} y={0} width={width} height={height} fill="#fff" stroke="#b8ccc3" strokeWidth={1 / view.scale} />
        {grid && <Group listening={false}>{Array.from({ length: 61 }, (_, i) => <Line key={`x${i}`} points={[i * 20, 0, i * 20, height]} stroke="#e9efec" strokeWidth={.7 / view.scale} />)}{Array.from({ length: Math.floor(height / 20) + 1 }, (_, i) => <Line key={`y${i}`} points={[0, i * 20, width, i * 20]} stroke="#e9efec" strokeWidth={.7 / view.scale} />)}</Group>}
        {doc.objects.map(o => { const w = o.width * width, h = o.height * height, active = selected.includes(o.id); return <Group key={o.id} id={o.id} name="plan-object" ref={node => { if (node) nodes.current.set(o.id, node); else nodes.current.delete(o.id) }} x={o.x * width} y={o.y * height} rotation={o.rotation} draggable={editing && !pan}
          onClick={e => { if (pan) return; select(o.id, e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey); if (o.rackId && !e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) onOpenRack(o.rackId) }} onTap={() => { if (pan) return; onSelect([o.id]); if (o.rackId) onOpenRack(o.rackId) }} onDblClick={e => { if (o.rackId && !pan && !e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) onOpenRack(o.rackId) }}
          onDragStart={() => dragStart(o.id)} onDragMove={() => dragMove(nodes.current.get(o.id)!)} onDragEnd={() => dragEnd(o.id)}
          onTransformEnd={() => { const n = nodes.current.get(o.id)!; const next = { ...o, x: round(clamp(n.x() / width, 0, 1)), y: round(clamp(n.y() / height, 0, 1)), width: round(clamp(o.width * n.scaleX(), .005, 1)), height: round(clamp(o.height * n.scaleY(), .005, 1)), rotation: rotation(n.rotation()) }; n.scale({ x: 1, y: 1 }); onChange({ ...doc, objects: doc.objects.map(item => item.id === o.id ? next : item) }) }}>
          {o.shape === 'ellipse' && o.type === 'shape' ? <Ellipse radiusX={w / 2} radiusY={h / 2} fill={o.fill} stroke={active ? '#137b6c' : '#6a8177'} strokeWidth={active ? 3 : 1} /> : <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={o.type === 'text' ? 'rgba(255,255,255,0.01)' : o.fill} stroke={active ? '#137b6c' : o.type === 'text' ? undefined : '#6a8177'} strokeWidth={active ? 3 : 1} dash={o.type === 'aisle' ? [8, 5] : undefined} cornerRadius={o.type === 'wall' ? 0 : 3} />}
          {o.type === 'rack' && <Group listening={false}>{[1, 2, 3].map(i => <Line key={i} points={[-w / 2 + w * i / 4, -h / 2, -w / 2 + w * i / 4, h / 2]} stroke="#729aac" />)}</Group>}
          {o.type === 'door' && <Line listening={false} points={[-w / 2, h / 2, w / 2, -h / 2]} stroke="#836b4f" strokeWidth={3} />}
          <Text listening={false} x={-w / 2 + 4} y={-h / 2 + 4} width={Math.max(1, w - 8)} height={Math.max(1, h - 8)} text={o.label} fontFamily="Noto Sans KR, sans-serif" fontSize={o.type === 'text' ? 24 : 16} fill={o.type === 'text' ? o.fill : o.type === 'wall' ? '#ffffff' : '#24483e'} align="center" verticalAlign="middle" ellipsis />
        </Group> })}
        <Transformer ref={transformer} flipEnabled={false} rotateEnabled keepRatio={false} boundBoxFunc={(old, next) => Math.abs(next.width) < 6 || Math.abs(next.height) < 6 ? old : next} />
        {marquee && <Rect {...marquee} fill="rgba(20,120,95,.12)" stroke="#137b6c" listening={false} />}
      </Layer>
    </Stage>
    <span className="warehouse-plan-scale">{Math.round(view.scale * 100)}% · {pan ? '화면 이동' : editing ? '객체 선택' : '조회'}</span>
  </div>
})
export default PlanCanvas
