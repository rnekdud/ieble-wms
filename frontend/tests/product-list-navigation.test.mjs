import assert from 'node:assert/strict'
import test from 'node:test'
import {productListDefaults,productListQuery,productListUrl,ownedProductListEntry,safeProductReturn} from '../src/product-list-navigation.ts'
test('query round trip retains supported product filters and pagination',()=>{
 const q={search:'메로나 & 아이스크림',categoryId:'22222222-2222-4222-8222-222222222222',status:'active',page:3,pageSize:50}
 assert.deepEqual(productListQuery(productListUrl(q).split('?')[1]),q)
 assert.equal(productListUrl(productListDefaults()),'/app/products')
})
test('malformed paging/status/category and oversized input are bounded',()=>{
 for(const page of ['-1','0','1.5','Infinity','1e20','not-a-page'])assert.equal(productListQuery('?page='+page).page,1)
 assert.deepEqual(productListQuery('?pageSize=999&status=invalid&categoryId=invalid'),productListDefaults())
 assert.equal(productListQuery('?search='+'x'.repeat(200)).search.length,100)
})
test('history data is owned by both tenant and user; return routes cannot leave products',()=>{
 const state={__iebleProductList:{owner:'u1:t1',returnTo:{url:'/app/products?search=메로나&page=3',scroll:120,draft:productListDefaults()}}}
 assert.equal(ownedProductListEntry(state,'u2:t1'),null)
 assert.equal(ownedProductListEntry(state,'u1:t2'),null)
 assert.equal(safeProductReturn(ownedProductListEntry(state,'u1:t1')).scroll,120)
 for(const url of ['https://example.com','//example.com','/app/products/../users','/app/products/123','/app/products#external'])assert.equal(safeProductReturn({owner:'u1:t1',returnTo:{url,scroll:0}}),null)
})
