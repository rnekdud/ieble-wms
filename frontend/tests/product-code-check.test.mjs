import test from 'node:test'
import assert from 'node:assert/strict'
import { findProductCodeConflict, normalizedProductCode } from '../src/product-code-check.ts'
const endpoint='/api/tenants/qa/products', target={id:'other',code:'PR06',name:'메로나'}
test('exact code match excludes self and fuzzy name/code results, across server pages',async()=>{
 const calls=[]
 const result=await findProductCodeConflict(async url=>{
  const u=new URL(url,'http://qa');calls.push(u);assert.equal(u.searchParams.get('status'),'all');assert.equal(u.searchParams.get('pageSize'),'100')
  return u.searchParams.get('page')==='1'?{items:[{product:{...target,id:'self'}},{product:{...target,code:'PR060'}}],total:3,page:1,pageSize:2}:{items:[{product:target}],total:3,page:2,pageSize:2}
 },endpoint,'  pr06  ','self')
 assert.deepEqual(result,target);assert.equal(calls.length,2);assert.equal(calls[0].pathname,endpoint)
})
test('blank codes skip automatic-code lookup; NFKC, whitespace and case normalize',async()=>{
 assert.equal(await findProductCodeConflict(()=>{throw Error('must not query')},endpoint,' '),null)
 assert.equal(normalizedProductCode(' ｐｒ０６ '),'PR06')
})
test('empty result, failed lookup and obsolete response are distinct',async()=>{
 assert.equal(await findProductCodeConflict(async()=>({items:[],total:0,page:1,pageSize:100}),endpoint,'NEW'),null)
 await assert.rejects(findProductCodeConflict(async()=>{throw Error('offline')},endpoint,'PR06'),/offline/)
 let active=true
 assert.equal(await findProductCodeConflict(async()=>{active=false;return {items:[{product:target}],total:1,page:1,pageSize:100}},endpoint,'PR06',undefined,()=>active),null)
})
