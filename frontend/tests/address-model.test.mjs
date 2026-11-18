import assert from 'node:assert/strict'
import {test} from 'node:test'
import {packAddress,unpackAddress,selectedAddress} from '../src/address-model.ts'
const old={postalCode:'12345',address:'기존 주소',addressDetail:'101호'}
test('prefer actual road address; fallback to jibun and selected address without inventing data',()=>{
 for(const [roadAddress,jibunAddress,address,expected] of [['도로명','지번','선택값','도로명'],['','지번','선택값','지번'],['','','선택값','선택값']]){
  assert.deepEqual(selectedAddress({zonecode:'54321',roadAddress,jibunAddress,address},old),{postalCode:'54321',address:expected,addressDetail:''})
 }
})
test('same address preserves detail; changed postcode/base clears stale detail',()=>{
 assert.deepEqual(selectedAddress({zonecode:'12345',roadAddress:'기존 주소',jibunAddress:'',address:''},old),old)
 assert.equal(selectedAddress({zonecode:'11111',roadAddress:'기존 주소',jibunAddress:'',address:''},old).addressDetail,'')
})
test('legacy company and warehouse strings remain byte-identical when unchanged',()=>{
 for(const address of ['','기존 주소 전체 12-3 101호','해외 20 Example St, London','  기존 주소  ']) {
  assert.equal(packAddress(unpackAddress(address),true),address)
  assert.equal(packAddress(unpackAddress(address,'별도 상세주소')),address)
 }
})
test('postcode/base/detail survive existing single and split storage without new columns',()=>{
 assert.deepEqual(unpackAddress(packAddress(old,true)),old)
 assert.deepEqual(unpackAddress(packAddress(old),old.addressDetail),old)
 const legacyDetail={...old,postalCode:''}
 assert.deepEqual(unpackAddress(packAddress(legacyDetail,true)),legacyDetail)
})
