import test from 'node:test'
import assert from 'node:assert/strict'
import {resizePlannedGroup} from '../src/receipt-planned.ts'
import {receiptProductGroups,distributeTracking} from '../src/receipt-groups.ts'
const rows=[{id:'a',productId:'p',unit:'EA',expectedQuantity:30},{id:'b',productId:'p',unit:'EA',expectedQuantity:70}]
test('planned group edits retain original IDs and quantities, including reductions',()=>{const [g]=receiptProductGroups(rows);assert.deepEqual(resizePlannedGroup(g,100).lines.map(l=>l.expectedQuantity),[30,70]);assert.deepEqual(resizePlannedGroup(g,80).lines.map(l=>[l.id,l.expectedQuantity]),[['a',30],['b',50]]);assert.deepEqual(resizePlannedGroup(g,120).lines.map(l=>l.expectedQuantity),[30,90]);assert.throws(()=>resizePlannedGroup(g,1),/원본 입고 행/);assert.deepEqual(rows.map(l=>l.expectedQuantity),[30,70])})
test('planned multiple LOTs split back to original IDs and optional tracking stays empty',()=>{const [g]=receiptProductGroups(rows),planned=resizePlannedGroup(g,100);const entries=[{id:'lot',lotNumber:'PRE',expiryDate:null,quantity:90,serials:['S1'],sourceLineIds:['b']}];const mapped=distributeTracking(planned,entries);assert.deepEqual(mapped.map(l=>l.lineId),['a','b']);assert.equal(mapped.flatMap(l=>l.allocations).reduce((n,a)=>n+a.quantity,0),90);assert.deepEqual(distributeTracking(planned,[]).map(l=>l.allocations),[[],[]])})
