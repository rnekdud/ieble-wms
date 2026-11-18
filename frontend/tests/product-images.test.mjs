import test from 'node:test'
import assert from 'node:assert/strict'
import { imageDrafts, imagePayload, removeImage, imageFilesError } from '../src/product-images.ts'
test('gallery preserves saved IDs/order and primary across payload, removal and draft changes', () => {
 const original={images:[{id:'a',fileName:'a.png',contentType:'image/png',isPrimary:false,position:0},{id:'b',fileName:'b.png',contentType:'image/png',isPrimary:true,position:1}]}
 const images=imageDrafts(original)
 assert.deepEqual(imagePayload(images).map(i=>i.id),['a','b'])
 assert.equal(imagePayload(images)[1].isPrimary,true)
 const remaining=removeImage(images,'b');assert.equal(remaining[0].isPrimary,true)
 assert.equal(images[0].isPrimary,false)
 assert.equal(imagePayload([{key:'new',fileName:'new.png',contentType:'image/png',base64:'data',preview:'data:image/png',isPrimary:true}])[0].preview,undefined)
 assert.deepEqual(removeImage(remaining,'a'),[])
})
test('gallery file limit/type/size failures are detected before replacing the draft', () => {
 const png=new File(['bytes'],'ok.png',{type:'image/png'})
 assert.equal(imageFilesError([png],7),null)
 assert.match(imageFilesError([png],8),/8장/)
 assert.match(imageFilesError([new File(['bad'],'bad.exe',{type:'image/png'})],0),/PNG/)
 assert.match(imageFilesError([new File([new Uint8Array(2*1024*1024+1)],'big.png',{type:'image/png'})],0),/2MB/)
})
