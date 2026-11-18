import test from 'node:test'
import assert from 'node:assert/strict'
import { configureCloseFocus, refocusCamera } from '../src/camera-close-focus.ts'

test('requests 1x and continuous focus independently and reports confirmed settings', async () => {
  const applied=[],settings={zoom:3,focusMode:'manual'}
  const track={readyState:'live',getCapabilities:()=>({zoom:{min:1,max:8},focusMode:['manual','continuous']}),getSettings:()=>settings,applyConstraints:async c=>{applied.push(c.advanced[0]);Object.assign(settings,c.advanced[0])}}
  assert.equal(await configureCloseFocus(track),'1배 · 연속 자동초점')
  assert.deepEqual(applied,[{zoom:1},{focusMode:'continuous'}])
})

test('refocus sweeps once then restores continuous focus; closing prevents late changes', async () => {
  for (const close of [false, true]) {
    const applied = []
    const track = { readyState: 'live', getCapabilities: () => ({ focusMode: ['single-shot', 'continuous'] }), applyConstraints: async c => { applied.push(c.advanced[0].focusMode); if (close) track.readyState = 'ended' } }
    assert.equal(await refocusCamera(track), !close)
    assert.deepEqual(applied, close ? ['single-shot'] : ['single-shot', 'continuous'])
  }
})
test('unsupported, rejected and ended tracks remain safe', async () => {
  let calls=0
  const track={readyState:'live',getCapabilities:()=>({zoom:{min:2,max:8},focusMode:['manual']}),getSettings:()=>({}),applyConstraints:async()=>{calls++;throw Error('unsupported')}}
  assert.equal(await configureCloseFocus(track),'');assert.equal(calls,0)
  track.getCapabilities=()=>({zoom:{min:1,max:8},focusMode:['continuous']})
  assert.equal(await configureCloseFocus(track),'');assert.equal(calls,2)
  track.readyState='ended';assert.equal(await configureCloseFocus(track),'');assert.equal(calls,2)
})
