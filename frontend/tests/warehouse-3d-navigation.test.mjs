import test from 'node:test'
import assert from 'node:assert/strict'
import { OrthographicCamera, Vector3 } from 'three'
import { FloorPan, TapGesture } from '../src/warehouse-3d-navigation.ts'
function scene() { const camera=new OrthographicCamera(-24,24,18,-18,.01,3000),target=new Vector3(0,1.4,0);camera.position.set(35,36.4,35);camera.lookAt(target);camera.zoom=1.4;camera.updateProjectionMatrix();camera.updateMatrixWorld();return {camera,target,pan:new FloorPan(camera,target)} }
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('click centres the actual ground point while preserving height, angle, distance and zoom throughout animation',()=>{
 const {camera,target,pan}=scene(),point=new Vector3(8,-.02,-4),offset=camera.position.clone().sub(target),q=camera.quaternion.clone(),zoom=camera.zoom,height=camera.position.y
 pan.start(point,100);assert(pan.active)
 const initial=camera.position.clone();pan.update(150);assert(camera.position.distanceTo(initial)>0);assert(pan.active)
 for(let time=160;time<=800;time+=16) {pan.update(time);close(camera.position.y,height);close(camera.position.clone().sub(target).distanceTo(offset),0);close(camera.quaternion.angleTo(q),0);close(camera.zoom,zoom)}
 camera.updateMatrixWorld();const projected=point.clone().project(camera);close(projected.x,0);close(projected.y,0);assert(!pan.active)
})
test('retarget starts from the visible pose and cancellation prevents later movement',()=>{
 const {camera,target,pan}=scene();pan.start(new Vector3(8,0,-4),0);pan.update(100);const position=camera.position.clone(),centre=target.clone()
 pan.start(new Vector3(-7,.065,4),100);pan.update(100);close(camera.position.distanceTo(position),0);close(target.distanceTo(centre),0)
 pan.update(700);camera.updateMatrixWorld();const point=new Vector3(-7,.065,4).project(camera);close(point.x,0);close(point.y,0)
 pan.start(new Vector3(3,0,2),800);pan.update(900);pan.cancel();const stopped=camera.position.clone();pan.update(2000);close(camera.position.distanceTo(stopped),0)
})
test('invalid and parallel ground intersections do not move the camera',()=>{
 const {camera,pan}=scene();pan.start(new Vector3(NaN,0,0),0);assert(!pan.active)
 camera.quaternion.identity();camera.updateMatrixWorld();pan.start(new Vector3(1,-.02,1),0);assert(!pan.active)
})
test('tap recognizer rejects right click, out-and-back drags, pinch remainder, cancellation and orphan releases',()=>{
 const g=new TapGesture();g.down(1,10,10,0);assert(g.up(1,12,12,0));assert(!g.up(1,12,12,0))
 g.down(1,10,10,2);assert(!g.up(1,10,10,2))
 g.down(1,10,10,0);g.move(1,30,10);g.move(1,10,10);assert(!g.up(1,10,10,0))
 g.down(1,10,10,0);g.down(2,20,10,0);assert(!g.up(1,10,10,0));assert(!g.up(2,20,10,0))
 g.down(1,10,10,0);g.cancel(1);assert(!g.up(1,10,10,0))
 g.down(3,10,10,0);assert(g.up(3,10,10,0))
})
