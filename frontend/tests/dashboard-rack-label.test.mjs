import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rackQuantitySummary,rackLabelFont} from '../src/dashboard-rack-label.ts'
test('physical rack totals retain distinct units, commas and empty racks',()=>{
 assert.equal(rackQuantitySummary([],0),'총 0개')
 assert.equal(rackQuantitySummary([{rackId:'r',unit:'개',quantity:1000}],2),'총 1,000개')
 assert.equal(rackQuantitySummary([{rackId:'r',unit:'EA',quantity:20},{rackId:'r',unit:'kg',quantity:5.5}],3),'3종 · 20 EA / 5.5 kg')
})
test('dashboard single-line font is capped in screen pixels and hidden when unreadable',()=>{
 for(const scale of [.1,.5,1,3]) for(const [w,h] of [[60,40],[300,100],[1200,600]]) {
  const font=rackLabelFont('안전 · 총 1,000개',w,h,scale,11)
  assert.ok(font*scale<=11)
  assert.ok(font===0 || font*scale>=8)
  assert.ok(font*2.6<=h-8)
 }
 assert.equal(rackLabelFont('안전 · 총 1,000개',20,12,1,11),0)
 assert.equal(rackLabelFont('안전 · 총 1,000개',1000,500,1,11),11)
})
