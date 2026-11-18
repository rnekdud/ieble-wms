import {test} from 'node:test'
import assert from 'node:assert/strict'
import {departmentHierarchy} from '../src/department-hierarchy.ts'
const item=(id,parentId=null,sortOrder=0)=>({id,name:id,parentId,sortOrder,isActive:true,version:'v1',memberCount:0})
test('parents precede children at every depth, siblings retain sort order and data is unchanged',()=>{
 const items=[item('part','team'),item('root-b',null,2),item('team','root-a',2),item('team-first','root-a',1),item('root-a',null,1)]
 const before=JSON.stringify(items),rows=departmentHierarchy(items)
 assert.deepEqual(rows.map(r=>[r.item.id,r.depth]),[['root-a',0],['team-first',1],['team',1],['part',2],['root-b',0]])
 assert.deepEqual(rows.filter(r=>r.item.name==='part').map(r=>r.ancestors),[['root-a','team']])
 assert.equal(JSON.stringify(items),before)
})
test('missing parents and cycles remain visible once without changing links',()=>{
 const items=[item('orphan','missing'),item('a','b'),item('b','a'),item('self','self')]
 const rows=departmentHierarchy(items)
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.item.id)).size,4)
 assert.equal(rows.find(r=>r.item.id==='orphan').depth,0)
 assert.equal(items[1].parentId,'b')
})
