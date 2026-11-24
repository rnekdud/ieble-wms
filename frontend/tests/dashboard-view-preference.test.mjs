import test from 'node:test'
import assert from 'node:assert/strict'
import { readDashboardView, rememberDashboardView } from '../src/dashboard-view-preference.ts'
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}}
test('first visit defaults to 3D with totals; saved 2D survives a fresh read',()=>{
 const s=storage();assert.deepEqual(readDashboardView('u','t',s),{view:'3d',showQuantities:true})
 rememberDashboardView('u','t',{view:'2d',showQuantities:false},s)
 assert.deepEqual(readDashboardView('u','t',s),{view:'2d',showQuantities:false})
 assert.equal(readDashboardView('other','t',s).view,'3d');assert.equal(readDashboardView('u','other',s).view,'3d')
})
test('missing identity, corrupt and blocked storage remain safe and usable',()=>{
 const s=storage();rememberDashboardView('','t',{view:'2d',showQuantities:false},s);assert.equal(readDashboardView('','t',s).view,'3d')
 for(const value of ['oops','null','{"view":"invalid","showQuantities":"false"}'])assert.deepEqual(readDashboardView('u','t',{getItem:()=>value}),{view:'3d',showQuantities:true})
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}
 assert.equal(readDashboardView('u','t',blocked).view,'3d');assert.doesNotThrow(()=>rememberDashboardView('u','t',{view:'2d',showQuantities:true},blocked))
})
