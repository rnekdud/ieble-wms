import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rackLabelPosition as position} from '../src/rack-label-position.ts'
const viewport={width:500,height:400},label={width:160,height:32}
test('rack annotation sits above the screen bounding box with a stable gap',()=>{assert.deepEqual(position({x:100,y:100,width:80,height:120},viewport,label),{x:60,y:60,below:false,anchor:80})})
test('annotation remains inside viewport at corners and falls below a top-edge rack',()=>{for(const box of [{x:-10,y:0,width:80,height:80},{x:460,y:260,width:90,height:130},{x:0,y:0,width:500,height:400}]){const p=position(box,viewport,label);assert(p.x>=8&&p.x+label.width<=492);assert(p.y>=8&&p.y+label.height<=392)}assert.equal(position({x:20,y:0,width:80,height:80},viewport,label).below,true)})
test('fully offscreen rack hides the annotation instead of pinning a misleading label',()=>{assert.equal(position({x:-100,y:20,width:50,height:50},viewport,label),null)})
