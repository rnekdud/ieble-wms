import test from 'node:test'
import assert from 'node:assert/strict'
import { productDraft, productError, productRequest, categoryPath, gramsToOunces, gramsToPounds } from '../src/product-model.ts'
test('blank product code is optional and numeric master fields stay separate from inventory units', () => {
 const d={...productDraft(),name:'상품',weightGrams:'500',costPrice:'1234.56',widthCm:'12.5'}
 assert.equal(productError(d,{mode:'keep'}),null)
 const r=productRequest(d,{mode:'keep'},'request');assert.equal(r.code,'');assert.equal(r.unit,'EA');assert.equal(r.weightGrams,500);assert.equal(r.costPrice,1234.56);assert.equal(r.boxWeightGrams,null);assert.equal(r.productTypeId,null)
 assert(productError({...d,weightGrams:'-1'},{mode:'keep'}))
})
test('weight display converts directly from canonical grams without round-trip mutation', () => { assert.equal(gramsToOunces(28.349523125),1);assert.equal(gramsToPounds(453.59237),1);assert.equal(gramsToOunces(0),0) })
test('category ancestry handles optional levels and defensive cycle limits', () => {
 const categories=[{id:'a',name:'A',parentId:null},{id:'b',name:'B',parentId:'a'},{id:'c',name:'C',parentId:'b'}]
 assert.deepEqual(categoryPath('c',categories).map(c=>c.id),['a','b','c']);assert.deepEqual(categoryPath(null,categories),[]);assert.equal(categoryPath('a',[{id:'a',parentId:'a'}]).length,1)
})
