import {test} from 'node:test'
import assert from 'node:assert/strict'
import {stocktakeDifferenceLabel, countInput, difference} from '../src/stocktake-model.ts'
import {isRegistrationPath, workspaceDetailId, findWorkspacePage, canOpenRegistration} from '../src/components/workspace/navigation.ts'
test('simple stocktake has a deep-linked registration/detail route with existing permissions',()=>{
 assert.equal(isRegistrationPath('/app/inventory/counts/new'),true)
 assert.equal(findWorkspacePage('/app/inventory/counts/new').key,'stocktake')
 assert.equal(canOpenRegistration('/app/inventory/counts/new',{stocktake:['read']}),false)
 assert.equal(canOpenRegistration('/app/inventory/counts/new',{stocktake:['read','create']}),true)
 const id='12345678-1234-1234-1234-123456789012'
 assert.equal(workspaceDetailId('/app/inventory/counts/'+id),id)
 assert.equal(findWorkspacePage('/app/inventory/counts/'+id).key,'stocktake')
})
test('missing and zero counts differ; exact decimal shortage/surplus labels stay unit-specific',()=>{
 assert.equal(stocktakeDifferenceLabel(countInput(''),20,'EA'),'미입력')
 assert.equal(stocktakeDifferenceLabel(countInput('0'),20,'EA'),'20 EA 부족 (-20)')
 assert.equal(stocktakeDifferenceLabel(20,20,'EA'),'차이 없음')
 assert.equal(stocktakeDifferenceLabel(23,20,'EA'),'3 EA 초과 (+3)')
 assert.equal(difference(0.3,0.2),0.1)
 assert.equal(stocktakeDifferenceLabel(0.3,0.2,'kg'),'0.1 kg 초과 (+0.1)')
})
