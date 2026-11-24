import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiptPhotoError, photoRequest } from '../src/receipt-photos.ts'
test('receipt photo limits and unsupported formats are explicit',()=>{
 const file={name:'입고.png',type:'image/png',size:5*1024*1024}
 assert.equal(receiptPhotoError([file],9),null)
 assert.match(receiptPhotoError([file],10),/10장/)
 assert.match(receiptPhotoError([{...file,size:file.size+1}],0),/5MB/)
 assert.match(receiptPhotoError([{...file,name:'촬영.HEIC',type:'image/heic'}],0),/HEIC\/HEIF/)
 assert.match(receiptPhotoError([{...file,type:'text/html'}],0),/JPG/)
 assert.equal(receiptPhotoError([{...file,name:'image.WEBP',type:'image/webp'}],0),null)
})
test('only new originals upload; retained IDs preserve order and exclude local previews',()=>{
 const photos=[{key:'one',id:'one',fileName:'saved.jpg',preview:'private'}, {key:'new',fileName:'new.png',contentType:'image/png',base64:'ORIGINAL',thumbnailBase64:'THUMB',preview:'data:original',thumbnail:'data:thumb'}]
 assert.deepEqual(photoRequest(photos),[{id:'one'},{fileName:'new.png',contentType:'image/png',base64:'ORIGINAL',thumbnailBase64:'THUMB'}])
 assert.deepEqual(photoRequest([]),[])
})
