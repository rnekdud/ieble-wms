import { MathUtils, OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'

/** Translate parallel to the ground so camera height, angle and zoom stay fixed.
 * The optical centre intersects the clicked surface below/above OrbitControls.target. */
export class FloorPan {
  private motion: { position: Vector3; target: Vector3; delta: Vector3; time: number; duration: number } | null = null
  private camera: OrthographicCamera
  private target: Vector3
  constructor(camera: OrthographicCamera, target: Vector3) { this.camera = camera; this.target = target }
  get active() { return this.motion !== null }
  cancel() { this.motion = null }
  start(point: Vector3, time: number) {
    this.cancel()
    if (![point.x, point.y, point.z].every(Number.isFinite)) return
    const ray = new Raycaster(), centre = new Vector3()
    this.camera.updateMatrixWorld()
    ray.setFromCamera(new Vector2(0, 0), this.camera)
    if (!ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -point.y), centre)) return
    const delta = point.clone().sub(centre); delta.y = 0
    if (delta.lengthSq() < 1e-10) return
    this.motion = { position: this.camera.position.clone(), target: this.target.clone(), delta, time, duration: MathUtils.clamp(220 + delta.length() * 9, 240, 500) }
  }
  update(time: number) {
    const motion = this.motion
    if (!motion) return
    const t = MathUtils.clamp((time - motion.time) / motion.duration, 0, 1), eased = t * t * (3 - 2 * t)
    this.camera.position.copy(motion.position).addScaledVector(motion.delta, eased)
    this.target.copy(motion.target).addScaledVector(motion.delta, eased)
    if (t === 1) this.motion = null
  }
}

/** One pointer, primary button, never dragged or part of a multi-touch gesture. */
export class TapGesture {
  private pointers = new Set<number>()
  private candidate: { id: number; x: number; y: number } | null = null
  down(id: number, x: number, y: number, button: number) {
    if (this.pointers.size === 0 && button === 0) this.candidate = { id, x, y }
    else this.candidate = null
    this.pointers.add(id)
  }
  move(id: number, x: number, y: number) {
    if (this.candidate?.id === id && Math.hypot(x - this.candidate.x, y - this.candidate.y) > 5) this.candidate = null
  }
  up(id: number, x: number, y: number, button: number) {
    this.move(id, x, y)
    const tapped = this.pointers.size === 1 && this.candidate?.id === id && button === 0
    this.pointers.delete(id); this.candidate = null
    return tapped
  }
  cancel(id: number) { this.pointers.delete(id); this.candidate = null }
}
