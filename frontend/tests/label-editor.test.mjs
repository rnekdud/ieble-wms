import assert from 'node:assert/strict'
import {test} from 'node:test'
import {papers,position,perPage,paperError,fresh,newObject,applyAll,copyLabel,commit,undo,redo,printIndices,changePaper,outside,cleanDesign} from '../src/label-editor/model.ts'
test('official paper geometry, last slot and custom overflow',()=>{
 const expected=[[1,0,0,210,297],[21,139.2,244.4,63.5,38.1],[16,106.3,251.5,99.1,33.9],[14,106.3,242.4,99.1,38.1]]
 papers.forEach((p,i)=>{assert.equal(paperError(p),null);assert.equal(perPage(p),expected[i][0]);const last=position(p,perPage(p)-1);assert(Math.abs(last.x-expected[i][1])<1e-8);assert(Math.abs(last.y-expected[i][2])<1e-8);assert.equal(p.labelWidth,expected[i][3]);assert.equal(p.labelHeight,expected[i][4]);assert.equal(position(p,perPage(p)).page,1)})
 assert(paperError({...papers[2],rows:9}));assert(paperError({...papers[2],columns:1.5}));assert(paperError({...papers[2],width:NaN}))
})
test('independent objects, apply all, undo/redo and image references',()=>{
 const d=fresh();d.labels[0].objects=[newObject('text',d.paper),{...newObject('image',d.paper),imageId:'kept'}];d.images={kept:'data:image/png;base64,abc',unused:'discard'}
 const all=applyAll(d,0);assert.equal(new Set(all.labels.flatMap(l=>l.objects.map(o=>o.id))).size,32);all.labels[1].objects[0].text='independent';assert.equal(d.labels[0].objects[0].text,'텍스트');assert.equal(all.labels[0].objects[0].text,'텍스트');assert.equal(copyLabel(d.labels[0]).objects[1].imageId,'kept')
 const h=commit({past:[],present:d,future:[]},all);assert.deepEqual(undo(h).present,d);assert.deepEqual(redo(undo(h)).present,all);assert.deepEqual(Object.keys(cleanDesign(d).images),['kept']);assert.deepEqual(changePaper(d,papers[1]).labels[0],d.labels[0]);assert.equal(changePaper(d,papers[1]).labels.length,21)
})
test('selected slots remain at their original positions across pages; rotated objects checked',()=>{
 let d=applyAll({...fresh(),labels:Array.from({length:32},()=>({objects:[newObject('text',papers[2])]}))},0);d.labels[1].objects=[]
 assert.deepEqual(printIndices(d,'2',[0,16,31]),[16,31]);assert(!printIndices(d,'',null).includes(1));assert.throws(()=>printIndices(d,'3',null));assert.throws(()=>printIndices(d,'2-1',null));assert.throws(()=>printIndices(d,'x',null));assert.deepEqual(printIndices(d,'',[]),[])
 const o=newObject('text',d.paper);assert(!outside(o,d.paper));assert(outside({...o,rotation:90},d.paper))
})
