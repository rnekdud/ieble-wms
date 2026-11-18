import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {touchFrame,touchViewport} from '../src/touch-viewport.ts'
test('pan and pinch preserve document coordinates and clamp zoom',()=>{
 const view={x:10,y:20,scale:.5},from=touchFrame([{x:100,y:100},{x:200,y:100}]),to=touchFrame([{x:75,y:120},{x:275,y:120}])
 const result=touchViewport(view,from,to)
 assert.equal(result.scale,1);assert.equal((to.x-result.x)/result.scale,(from.x-view.x)/view.scale)
 assert.equal((to.y-result.y)/result.scale,(from.y-view.y)/view.scale)
 assert.deepEqual(touchViewport(view,touchFrame([{x:10,y:10}]),touchFrame([{x:40,y:30}])),{x:40,y:40,scale:.5})
 assert.equal(touchViewport({...view,scale:3},from,to).scale,4);assert.equal(touchFrame([]),null)
})
test('PWA cache excludes business, identity, non-GET and arbitrary images',()=>{
 const listeners={};vm.runInNewContext(readFileSync(new URL('../public/mobile-sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://wms.test'},addEventListener:(name,fn)=>listeners[name]=fn},URL})
 for(const [url,method] of [['/api/tenants/t/inventory','GET'],['/api/auth/me','GET'],['/api/receipts','POST'],['/uploads/customer.png','GET'],['https://other.test/a.js','GET']]){
  let handled=false;listeners.fetch({request:{url:new URL(url,'https://wms.test').href,method,mode:'cors'},respondWith:()=>handled=true});assert.equal(handled,false,url)
 }
})
