import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanProgress, scanLineStatus, restoreScanQueue } from '../src/receipt-scan.ts'
test('inspection progress counts distinct products, not mixed EA/kg quantities or LOT lines',()=>{
 const lines=[{productId:'a',expectedQuantity:20,inspectedQuantity:20,unit:'EA'},{productId:'a',expectedQuantity:5,inspectedQuantity:2,unit:'EA'},{productId:'b',expectedQuantity:10,inspectedQuantity:10,unit:'kg'}]
 assert.deepEqual(scanProgress(lines),{total:2,complete:1,percent:50});lines[1].inspectedQuantity=5;assert.equal(scanProgress(lines).percent,100);assert.equal(scanProgress([]).percent,0)
})
test('line states distinguish waiting, partial, finished shortage and overflow attempts',()=>{
 const line={expectedQuantity:20,inspectedQuantity:null};assert.equal(scanLineStatus(line,false,false),'검수 대기');line.inspectedQuantity=5;assert.equal(scanLineStatus(line,false,false),'검수 중');assert.equal(scanLineStatus(line,true,false),'수량 부족');line.inspectedQuantity=20;assert.equal(scanLineStatus(line,false,false),'검수 완료');assert.equal(scanLineStatus(line,false,true),'초과 시도')
})
test('uncertain queued scans retain exact event IDs and selected LOT across refresh',()=>{
 const commands=[{kind:'scan',requestId:crypto.randomUUID(),barcode:'880123',lineId:'lot-a'},{kind:'scan',requestId:crypto.randomUUID(),barcode:'880123',lineId:null}];assert.deepEqual(restoreScanQueue(JSON.stringify(commands)),commands);assert.notEqual(commands[0].requestId,commands[1].requestId);assert.deepEqual(restoreScanQueue('broken'),[]);assert.deepEqual(restoreScanQueue(JSON.stringify([{kind:'scan',barcode:'880123'}])),[])
})
