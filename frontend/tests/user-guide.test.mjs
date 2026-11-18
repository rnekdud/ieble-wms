import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {userGuides,searchGuides} from '../src/user-guide.ts'
import {findWorkspacePage,canViewPage} from '../src/components/workspace/navigation.ts'
test('manual contains complete articles and real image assets',()=>{
 assert.equal(userGuides.length,13)
 assert.equal(new Set(userGuides.map(g=>g.id)).size,13)
 for(const guide of userGuides){
  assert(guide.sections.length>=2,guide.id)
  assert(guide.sections.some(s=>s.image),guide.id)
  for(const s of guide.sections){
   assert(s.paragraphs.length>=2,s.title)
   if(s.image){const bytes=readFileSync(new URL(`../public/guide/${s.image}.jpg`,import.meta.url));assert.equal(bytes.readUInt16BE(0),0xffd8);assert(bytes.length>5000)}
  }
 }
})
test('search covers title, feature text, AND terms and category',()=>{
 assert(searchGuides('포장 단위').some(g=>g.id==='products'))
 assert(searchGuides('피킹').some(g=>g.id==='shipments'))
 assert(searchGuides('BP01').some(g=>g.id==='partners'))
 assert(searchGuides('LOT 검수','처음 시작하기').some(g=>g.id==='receipts'))
 assert(searchGuides('  ','기능별 이용 가이드').every(g=>g.category==='기능별 이용 가이드'))
 assert.deepEqual(searchGuides('존재하지않는기능xyz'),[])
})
test('manual deep links are static but do not grant any business permissions',()=>{
 const page=findWorkspacePage('/app/guide')
 assert.equal(page.business,false)
 for(const g of userGuides)assert.equal(findWorkspacePage('/app/guide/'+g.id),page)
 assert.equal(findWorkspacePage('/app/guide/warehouses/unexpected'),undefined)
 assert.equal(canViewPage(page,'Employee',{}),true)
 assert.equal(canViewPage(page,undefined,{}),false)
 assert.equal(canViewPage(findWorkspacePage('/app/warehouses'),'Employee',{}),false)
})
