import test from 'node:test'
import assert from 'node:assert/strict'
import {productDraft,productError,productRequest,productDirty,productUnitLabel} from '../src/product-model.ts'
const existing={id:'id',code:'P01',name:'상품',categoryId:'cat',unit:'kg',barcode:'ABC',barcodeType:'Internal',barcodeIsGenerated:false,lotManaged:true,expiryManaged:true,serialManaged:true,safetyStock:1.25,isActive:true,notes:'비고',version:'version'}
test('product request retains identity/version, unit and all tracking flags without making inventory',()=>{
 const draft=productDraft(existing),change={mode:'auto',value:'IBP-123',proof:'signed'}
 const body=productRequest(draft,change,'request',existing)
 assert.equal(body.version,'version');assert.equal(body.unit,'kg');assert.equal(body.safetyStock,1.25)
 assert(body.lotManaged&&body.expiryManaged&&body.serialManaged);assert.deepEqual(body.barcode,change)
 assert(!('quantity' in body));assert(!('trackingLockedAt' in body))
})
test('empty optional values and barcode remain optional with required code/name and precise safety stock',()=>{
 const draft=productDraft();assert(productError(draft,{mode:'keep'}));draft.code='P01';draft.name='상품'
 const body=productRequest(draft,{mode:'keep'},'request');assert.equal(body.categoryId,null);assert.equal(body.safetyStock,null);assert.equal(body.notes,null)
 for(const safety of ['-1','1.2345','NaN','1000000000']){assert(productError({...draft,safetyStock:safety},{mode:'keep'}))}
 for(const safety of ['0','0.001','999999999.999']){assert.equal(productError({...draft,safetyStock:safety},{mode:'keep'}),null)}
 assert(productError(draft,{mode:'manual',value:'한글'}))
})
test('product dirty guard handles reverting all input and barcode values',()=>{
 const initial=productDraft(existing)
 assert.equal(productDirty({...initial},initial,{mode:'keep'},existing),false)
 assert.equal(productDirty({...initial,unit:'EA'},initial,{mode:'keep'},existing),true)
 assert.equal(productDirty({...initial,lotManaged:false},initial,{mode:'keep'},existing),true)
 assert.equal(productDirty({...initial,safetyStock:'1.250'},initial,{mode:'manual',value:'ABC'},existing),false)
 assert.equal(productDirty(initial,initial,{mode:'none'},existing),true)
})

test('unit labels remain separate from stored codes and legacy names load canonically',()=>{
 for(const [unit,code,label] of [['개','EA','EA / 개'],['EA','EA','EA / 개'],['박스','BOX','BOX / 박스'],['BOX','BOX','BOX / 박스'],['kg','kg','kg']]) {
  const draft=productDraft({...existing,unit})
  assert.equal(draft.unit,code);assert.equal(productUnitLabel(unit),label)
  assert.equal(productRequest(draft,{mode:'keep'},'request',existing).unit,code)
  assert.equal(draft.safetyStock,'1.25')
 }
})
