import { getLanguage, t as uiText } from '../../i18n.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as T from 'three'
import { FloorPan, TapGesture } from '../../warehouse-3d-navigation'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlanDocument } from '../../warehouse-plan-model'
import type { StorageItem } from '../../types/warehouse'
import { sceneWidth, shelfStep, planToWorld, sceneRacks, detailedShelves } from '../../warehouse-3d-model'
import type { RackPick } from '../../warehouse-3d-model'
export type SceneApi = { fit: () => void; top: () => void; zoom: (factor: number) => void; focus: (id: string) => void }
export type RackAnnotations = Record<string, { label: string; summary: string; fill: string; quantity?: string; statusLabel?: string; meshColor?: string }>
type Props = { annotations?: RackAnnotations; showAnnotations?: boolean; plan: PlanDocument; racks: StorageItem[]; selected: RackPick | null; onPick: (pick: RackPick) => void; onReady: (api: SceneApi | null) => void }
// Adapted from the standalone preview: OrbitControls, orthographic fit, demand
// rendering and instanced boxes. All demo geometry and sample inventory removed.
export default function WarehouseScene({ plan, racks, selected, onPick, onReady, annotations, showAnnotations = true }: Props) {
  const host = useRef<HTMLDivElement>(null), callbacks = useRef({ onPick, onReady }), selection = useRef(selected)
  const language = getLanguage()
  const annotationRef = useRef(annotations)
  const bubbles = useRef(new Map<string, HTMLButtonElement>())
  const linkedRacks = useMemo(() => sceneRacks(plan, racks), [plan, racks])
  const refresh = useRef<(() => void) | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => { callbacks.current = { onPick, onReady } }, [onPick, onReady])
  useEffect(() => { selection.current = selected; refresh.current?.() }, [selected])
  useEffect(() => { annotationRef.current = annotations; host.current?.querySelector('canvas')?.setAttribute('aria-label', uiText('창고 3D 도면 캔버스')); refresh.current?.() }, [annotations, showAnnotations, language])
  useEffect(() => {
    const el = host.current!
    let renderer: T.WebGLRenderer
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) }
    catch { const pending = requestAnimationFrame(() => setFailed(true)); return () => cancelAnimationFrame(pending) }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor('#edf2ef'); renderer.outputColorSpace = T.SRGBColorSpace
    el.appendChild(renderer.domElement); renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', uiText('창고 3D 도면 캔버스'))
    const scene = new T.Scene(), camera = new T.OrthographicCamera(-25, 25, 18, -18, .01, 3000), controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = .12; controls.minZoom = .02; controls.maxZoom = 20; controls.maxPolarAngle = Math.PI / 2 - .005; controls.screenSpacePanning = true
    scene.add(new T.HemisphereLight('#ffffff', '#a6bbb1', 2.8)); const sun = new T.DirectionalLight('#ffffff', 2); sun.position.set(-15, 30, 20); scene.add(sun)
    const geometry = new T.BoxGeometry(1, 1, 1), material = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .8 })
    const boxes: { matrix: T.Matrix4; color: string; pick?: RackPick; floor?: boolean }[] = [], sprites: T.Sprite[] = [], textures: T.Texture[] = []
    const rackLabels: { rackId: string; code: string; update: (text: string, color?: string) => void }[] = []
    const rotation = new T.Quaternion(), unit = new T.Vector3(1, 1, 1)
    function box(transform: T.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: string, pick?: RackPick, floor = false) {
      const local = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(Math.max(w, .008), Math.max(h, .008), Math.max(d, .008)))
      boxes.push({ matrix: new T.Matrix4().multiplyMatrices(transform, local), color, pick, floor })
    }
    function label(text: string, position: T.Vector3, width: number, pick?: RackPick, readable = false) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96
      const ctx = canvas.getContext('2d'); if (!ctx) return
      const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; textures.push(texture)
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: !readable, depthWrite: !readable })); sprite.position.copy(position); sprite.scale.set(width, width * 96 / 512, 1); sprite.userData.pick = pick; sprite.userData.fixedLabel = readable; if (readable) sprite.renderOrder = 2; sprites.push(sprite); scene.add(sprite)
      let previous = ''
      const update = (value: string, ink = '#285347') => {
        const next = `${value}:${ink}`; if (next === previous) return; previous = next
        ctx.clearRect(0, 0, 512, 96)
        if (!readable) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 96) }
        ctx.fillStyle = ink; ctx.font = readable ? '700 54px system-ui' : '600 38px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        if (readable) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeText(value, 256, 48, 490) }
        ctx.fillText(value, 256, 48, 490)
        texture.needsUpdate = true
      }
      update(text)
      return update
    }
    const identity = new T.Matrix4(), depth = sceneWidth / plan.aspectRatio, linked = sceneRacks(plan, racks), detailed = detailedShelves(linked)
    box(identity, 0, -.12, 0, sceneWidth, .2, depth, '#f8faf8', undefined, true)
    const linkedObjects = new Set(linked.map(r => r.object.id))
    for (const object of plan.objects) {
      if (linkedObjects.has(object.id)) continue
      const p = planToWorld(object, plan.aspectRatio), m = new T.Matrix4().compose(new T.Vector3(p.x, 0, p.z), rotation.setFromAxisAngle(new T.Vector3(0, 1, 0), p.rotation), unit)
      if (object.type === 'door') {
        box(m, 0, 2, 0, p.width, .12, p.depth, '#997d57')
        for (const x of [-p.width / 2, p.width / 2]) box(m, x, 1, 0, .1, 2, p.depth, '#997d57')
      } else if (object.type !== 'text') {
        const h = object.type === 'wall' ? 1.8 : object.type === 'rack' ? .25 : .025
        box(m, 0, h / 2 + (object.type === 'zone' ? .005 : .04), 0, p.width, h, p.depth, object.fill, undefined, object.type === 'aisle' || object.type === 'zone')
      }
      if (plan.objects.length <= 80 && object.label && ['zone', 'text', 'door'].includes(object.type)) label(object.label, new T.Vector3(p.x, object.type === 'door' ? 2.3 : .3, p.z), Math.min(4, Math.max(1, p.width)))
    }
    for (const { rack, world: p } of linked) {
      const m = new T.Matrix4().compose(new T.Vector3(p.x, 0, p.z), rotation.setFromAxisAngle(new T.Vector3(0, 1, 0), p.rotation), unit)
      const levels = rack.levels || 1, bays = rack.bays || 1, height = levels * shelfStep + .15, bw = p.width / bays, pick = { rackId: rack.id }
      // Large plans retain all rack footprints; exact shelves remain in the selected rack panel.
      const columns = detailed ? Array.from({ length: bays + 1 }, (_, i) => -p.width / 2 + i * bw) : [-p.width / 2, p.width / 2]
      for (const x of columns) for (const z of [-p.depth / 2, p.depth / 2]) box(m, x, height / 2, z, .055, height, .055, rack.isActive ? '#52796e' : '#929c97', pick)
      const floors = detailed ? Array.from({ length: levels }, (_, i) => i) : [0, levels - 1]
      for (const level of floors) {
        const y = level * shelfStep + .13
        box(m, 0, y, 0, p.width, .065, p.depth, '#a7bdb3', pick)
        if (detailed) for (let bay = 1; bay <= bays; bay++) box(m, -p.width / 2 + (bay - .5) * bw, y + .05, 0, bw * .92, .025, p.depth * .9, '#d3e2db', { rackId: rack.id, level: level + 1, bay })
      }
      if (linked.length <= 80 || annotationRef.current) {
        const update = label(rack.code, new T.Vector3(p.x, height + .4, p.z), Math.min(annotationRef.current ? 3.5 : 2.5, Math.max(.9, p.width)), pick, !!annotationRef.current)
        if (update) rackLabels.push({ rackId: rack.id, code: rack.code, update })
      }
    }
    const batch = new T.InstancedMesh(geometry, material, boxes.length), color = new T.Color()
    boxes.forEach((box, index) => { batch.setMatrixAt(index, box.matrix); batch.setColorAt(index, color.set(box.color)) }); batch.computeBoundingSphere(); batch.computeBoundingBox(); scene.add(batch)
    const bounds = batch.boundingBox!, center = bounds.getCenter(new T.Vector3()), extent = bounds.getSize(new T.Vector3()).length()
    const floorPan = new FloorPan(camera, controls.target)
    const stopPan = () => floorPan.cancel()
    controls.addEventListener('start', stopPan)
    let frame = 0, disposed = false, frames = 0, totalMs = 0
    function render() {
      frame = 0; if (disposed) return
      const start = performance.now(); floorPan.update(start); controls.update()
      const labelUnit = (camera.top - camera.bottom) / camera.zoom / Math.max(1, el.clientHeight)
      sprites.forEach(sprite => { if (sprite.userData.fixedLabel) sprite.scale.set(150 * labelUnit, 28 * labelUnit, 1) })
      renderer.render(scene, camera)
      for (const { object, rack, world } of linked) {
        const bubble = bubbles.current.get(object.id); if (!bubble) continue
        const point = new T.Vector3(world.x, (rack.levels || 1) * shelfStep + .8, world.z).project(camera)
        const visible = Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1
        bubble.style.visibility = visible ? 'visible' : 'hidden'
        const x = (point.x + 1) / 2 * el.clientWidth, y = (1 - point.y) / 2 * el.clientHeight
        const half = bubble.offsetWidth / 2 + 8
        bubble.style.left = `${Math.max(half, Math.min(el.clientWidth - half, x))}px`
        bubble.style.top = `${Math.max(bubble.offsetHeight + 8, y)}px`
      }
      totalMs += performance.now() - start; frames++
      el.dataset.drawCalls = String(renderer.info.render.calls); el.dataset.instances = String(boxes.length); el.dataset.renderMs = (totalMs / frames).toFixed(2); el.dataset.frames = String(frames)
      el.dataset.panning = String(floorPan.active)
      if (floorPan.active) invalidate()
      el.dataset.camera = JSON.stringify({ position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom })
    }
    function invalidate() { if (!frame && !disposed) frame = requestAnimationFrame(render) }
    controls.addEventListener('change', invalidate)
    function fit(top = false) {
      stopPan()
      controls.target.copy(center); camera.position.copy(center).add(top ? new T.Vector3(0, extent * 1.5, .001) : new T.Vector3(extent, extent, extent))
      camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); camera.updateMatrixWorld()
      let limit = .01
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y + .8]) for (const z of [bounds.min.z, bounds.max.z]) { const v = new T.Vector3(x, y, z).project(camera); limit = Math.max(limit, Math.abs(v.x), Math.abs(v.y)) }
      camera.zoom = .85 / limit; camera.updateProjectionMatrix(); controls.update(); invalidate()
    }
    const api: SceneApi = { fit: () => fit(), top: () => fit(true), zoom: factor => { stopPan(); camera.zoom = T.MathUtils.clamp(camera.zoom * factor, .02, 20); camera.updateProjectionMatrix(); invalidate() }, focus: id => {
      stopPan()
      const r = linked.find(r => r.rack.id === id); if (!r) return
      const target = new T.Vector3(r.world.x, (r.rack.levels || 1) * shelfStep / 2, r.world.z), direction = camera.position.clone().sub(controls.target).normalize().multiplyScalar(20)
      controls.target.copy(target); camera.position.copy(target).add(direction); camera.zoom = Math.min(8, 12 / Math.max(r.world.width, r.world.depth, (r.rack.levels || 1) * shelfStep)); camera.updateProjectionMatrix(); controls.update(); invalidate()
    } }
    callbacks.current.onReady(api)
    refresh.current = () => {
      rackLabels.forEach(({ rackId, code, update }) => {
        const annotation = annotationRef.current?.[rackId]
        update([code, annotation?.statusLabel ? uiText(annotation.statusLabel) : ''].filter(Boolean).join(' · '), annotation?.meshColor)
      })
      boxes.forEach((box, index) => { const active = box.pick?.rackId === selection.current?.rackId && !!selection.current, chosen = active && box.pick?.level === selection.current?.level && box.pick?.bay === selection.current?.bay && !!box.pick?.level
        const riskColor = box.pick ? annotationRef.current?.[box.pick.rackId]?.meshColor : undefined
        batch.setColorAt(index, color.set(riskColor || (chosen ? '#e8ab46' : active ? '#238b75' : box.color))) })
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true; invalidate()
    }; refresh.current()
    let first = true
    const observer = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.left = -18 * w / h; camera.right = 18 * w / h; camera.top = 18; camera.bottom = -18; camera.updateProjectionMatrix(); if (first) { first = false; fit() } else invalidate() }); observer.observe(el)
    const ray = new T.Raycaster(), pointer = new T.Vector2(), gesture = new TapGesture()
    const pointerDown = (e: PointerEvent) => { stopPan(); gesture.down(e.pointerId, e.clientX, e.clientY, e.button) }
    const pointerMove = (e: PointerEvent) => gesture.move(e.pointerId, e.clientX, e.clientY)
    const pointerCancel = (e: PointerEvent) => gesture.cancel(e.pointerId)
    const pointerUp = (e: PointerEvent) => {
      if (!gesture.up(e.pointerId, e.clientX, e.clientY, e.button)) return
      const b = renderer.domElement.getBoundingClientRect()
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return
      pointer.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1)
      camera.updateMatrixWorld(); ray.setFromCamera(pointer, camera)
      // Decorative labels do not block the floor; racks and solid objects do.
      const hit = ray.intersectObjects([batch, ...sprites.filter(sprite => sprite.userData.pick)], false)[0]
      if (!hit) return
      const item = hit.object === batch ? boxes[hit.instanceId!] : undefined
      const pick = item?.pick || hit.object.userData.pick as RackPick | undefined
      if (pick) { callbacks.current.onPick(pick); return }
      if (!item?.floor || (hit.face?.normal.y || 0) < .5 || Math.abs(hit.point.x) > sceneWidth / 2 || Math.abs(hit.point.z) > depth / 2) return
      // Clear residual OrbitControls inertia through its public API, restoring the
      // visible pose before painting so the click does not change the viewing angle.
      const position = camera.position.clone(), target = controls.target.clone(), quaternion = camera.quaternion.clone(), zoom = camera.zoom
      controls.enableDamping = false; controls.update(); controls.enableDamping = true
      camera.position.copy(position); controls.target.copy(target); camera.quaternion.copy(quaternion); camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
      floorPan.start(hit.point, performance.now()); invalidate()
    }
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); callbacks.current.onReady(null) }
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerCancel); renderer.domElement.addEventListener('lostpointercapture', pointerCancel); renderer.domElement.addEventListener('webglcontextlost', lost)
    el.dataset.ready = 'true'; el.dataset.detail = detailed ? 'shelves' : 'rack-outlines'; el.dataset.racks = String(linked.length)
    return () => { disposed = true; stopPan(); controls.removeEventListener('start', stopPan); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerCancel); renderer.domElement.removeEventListener('lostpointercapture', pointerCancel); cancelAnimationFrame(frame); observer.disconnect(); refresh.current = null; callbacks.current.onReady(null); controls.dispose(); batch.dispose(); material.dispose(); geometry.dispose(); textures.forEach(t => t.dispose()); sprites.forEach(s => s.material.dispose()); renderer.dispose(); renderer.domElement.remove(); delete el.dataset.ready }
  }, [plan, racks])
  return <div ref={host} className="warehouse-scene" aria-label={uiText("조회 전용 3D 창고")}>{annotations && showAnnotations && !failed && <div className="warehouse-scene-bubbles" aria-label={uiText("랙 이름 및 재고 상태")}>{linkedRacks.map(({ object, rack }) => {
    const annotation = annotations[rack.id]
    return annotation ? <button type="button" className="warehouse-rack-bubble" key={object.id} data-rack-id={rack.id} aria-pressed={selected?.rackId === rack.id} ref={el => { if (el) bubbles.current.set(object.id, el); else bubbles.current.delete(object.id) }} style={{ visibility: 'hidden', borderColor: annotation.meshColor || annotation.fill }} aria-label={[annotation.label, uiText(annotation.statusLabel || ''), uiText(annotation.quantity || annotation.summary || ''), uiText('재고 보기')].filter(Boolean).join(' · ')} onClick={() => callbacks.current.onPick({ rackId: rack.id })}><strong>{annotation.label}</strong>{annotation.statusLabel && <span className="warehouse-rack-status" style={{ color: annotation.meshColor }}>{uiText(annotation.statusLabel)}</span>}<span className="warehouse-rack-quantity">{uiText(annotation.quantity || annotation.summary || '')}</span></button> : null
  })}</div>}{failed && <div className="warehouse-webgl-error" role="alert"><strong>{uiText("3D 화면을 표시할 수 없습니다.")}</strong><p>{uiText("Chrome 그래픽 가속 설정을 확인하거나 2D 도면을 이용해 주세요. 3D 도면을 다시 열어 재시도할 수 있습니다.")}</p></div>}</div>
}
