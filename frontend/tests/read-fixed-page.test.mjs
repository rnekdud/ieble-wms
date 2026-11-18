import test from 'node:test'
import assert from 'node:assert/strict'
import { readFixedPage } from '../src/read-fixed-page.ts'

test('fixed paging fetches only intersecting server pages, preserves filters, and has no gaps or duplicates', async t => {
 t.mock.method(globalThis,'fetch',async (url, options)=>{
  assert.equal(options.method,'GET')
  const u=new URL(url,'http://localhost');assert.equal(u.searchParams.get('search'),'조회');assert.equal(u.searchParams.get('pageSize'),'20')
  const page=+u.searchParams.get('page'),total=125
  return Response.json({items:Array.from({length:Math.max(0,Math.min(20,total-(page-1)*20))},(_,i)=>(page-1)*20+i+1),total,page,pageSize:20})
 })
 const old=globalThis.window;globalThis.window={location:{origin:'http://localhost'}}
 try {
  const results=[]
  for(let page=1;page<=3;page++)results.push(await readFixedPage(`/api/tenants/qa/activity-log?search=조회&page=${page}&pageSize=50`))
  assert.deepEqual(results.map(x=>x.items.length),[50,50,25]);assert.deepEqual(results.flatMap(x=>x.items),Array.from({length:125},(_,i)=>i+1))
  assert(results.every(x=>x.total===125&&x.pageSize===50))
  assert.deepEqual(fetch.mock.calls.map(c=>+new URL(c.arguments[0],'http://localhost').searchParams.get('page')),[1,2,3,3,4,5,6,7])
  assert.equal((await readFixedPage('/api/tenants/qa/activity-log?search=조회&page=999&pageSize=50')).items.length,0)
 }finally{globalThis.window=old}
})

test('a failed server page rejects the window rather than presenting partial results',async t=>{
 const old=globalThis.window;globalThis.window={location:{origin:'http://localhost'}}
 t.mock.method(globalThis,'fetch',async url=>new URL(url,'http://localhost').searchParams.get('page')==='2'?Response.json({message:'조회 실패'},{status:503}):Response.json({items:Array.from({length:20},(_,i)=>i),total:100,pageSize:20}))
 try {await assert.rejects(readFixedPage('/api/tenants/qa/stocktakes?page=1&pageSize=50'),/서버 요청/)}finally{globalThis.window=old}
})
