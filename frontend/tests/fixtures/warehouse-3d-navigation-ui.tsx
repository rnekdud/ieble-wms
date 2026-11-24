import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { OrthographicCamera, Vector3, Vector2, Raycaster, Plane } from 'three'
import WarehouseScene, { type SceneApi } from '../../src/components/workspace/WarehouseScene'
import { createPlanObject } from '../../src/warehouse-plan-model'
import type { RackPick } from '../../src/warehouse-3d-model'
import '../../src/components/workspace/warehouse-3d.css'
const plan = { aspectRatio: 1.6, objects: [
  { ...createPlanObject('rack', 'rack'), x: .65, y: .35, width: .16, height: .2, rackId: 'qa-rack' },
  { ...createPlanObject('aisle', 'aisle'), x: .3, y: .5, width: .16, height: .6 },
  { ...createPlanObject('wall', 'wall'), x: .5, y: .1, width: .65, height: .02 },
  { ...createPlanObject('rack', 'unlinked'), x: .5, y: .75, width: .1, height: .1 },
] }
const racks = [{ id: 'qa-rack', code: 'R-01', name: 'QA 랙', levels: 3, bays: 4, isActive: true, version: '1', createdAt: '', updatedAt: '' }]
export default function TestScene() {
  const api = useRef<SceneApi | null>(null), [pick, setPick] = useState<RackPick | null>(null), [picks, setPicks] = useState(0)
  return <><div><button onClick={() => api.current?.fit()}>맞춤</button><button onClick={() => api.current?.top()}>상단</button><button onClick={() => api.current?.zoom(1.2)}>확대</button></div><output id="pick" data-count={picks}>{JSON.stringify(pick)}</output><WarehouseScene plan={plan} racks={racks} selected={pick} onPick={p => { setPick(p); setPicks(n => n + 1) }} onReady={value => { api.current = value }} /></>
}
function projection() {
  const el = document.querySelector<HTMLElement>('.warehouse-scene')!, rect = el.querySelector('canvas')!.getBoundingClientRect(), state = JSON.parse(el.dataset.camera!)
  const camera = new OrthographicCamera(-18 * rect.width / rect.height, 18 * rect.width / rect.height, 18, -18, .01, 3000)
  camera.position.fromArray(state.position); camera.zoom = state.zoom; camera.lookAt(new Vector3().fromArray(state.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  return { camera, rect }
}
Object.assign(window, { qaProject: (point: number[]) => { const { camera, rect } = projection(), p = new Vector3().fromArray(point).project(camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 } }, qaGround: (x: number, y: number, height = -.02) => { const { camera, rect } = projection(), ray = new Raycaster(); ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera); return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -height), new Vector3())?.toArray() }, qaPlan: plan })
createRoot(document.getElementById('root')!).render(<TestScene />)
