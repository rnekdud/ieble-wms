import test from 'node:test'
import assert from 'node:assert/strict'
import {partnerDraft,partnerRequest,partnerError,partnerDirty,businessNumberError} from '../src/partner-model.ts'
test('partner request retains version, all contact fields and stable type without changing identity',()=>{
 const p={id:'stable',version:'version',code:'P01',name:'거래처',type:'BOTH',registrationCountry:'KR',isActive:false,address:'주소',addressDetail:'2층',phone:'+82 (2) 123-4567',contactPhone:'+1 212 555-0100',email:'a@example.com',postalCode:'01234',businessRegistrationNumber:'123-45-67890'}
 const d=partnerDraft(p),r=partnerRequest(d,'request',p)
 assert.equal(r.version,'version');assert.equal(r.requestId,'request');assert.equal(r.isActive,false);assert.equal(r.type,'BOTH');assert.equal(r.addressDetail,'2층');assert.equal(r.postalCode,'01234');assert.equal(r.contactPhone,p.contactPhone);assert.equal(partnerError(d),null);assert(!('id' in r))
})
test('domestic number format is scoped and overseas identifiers remain usable',()=>{
 assert.equal(businessNumberError('123-45-67890','KR'),null);assert.equal(businessNumberError('','KR'),null)
 assert(businessNumberError('12-34','KR'));assert(businessNumberError('AB1234567890','KR'));assert.equal(businessNumberError('GB-ABC123','OTHER'),null)
})
test('required fields, email and international phone validation',()=>{
 const d=partnerDraft();assert(partnerError(d));d.code='P01';d.name='거래처'
 for(const phone of ['+82 (2) 123-4567','+1 212 555 0100','02-123-4567'])assert.equal(partnerError({...d,phone}),null)
 for(const phone of ['abc','+++'])assert(partnerError({...d,phone}))
 assert(partnerError({...d,email:'invalid'}));assert.equal(partnerError({...d,email:'test@example.com'}),null)
})
test('reverting edits clears unsaved state and optional blanks persist as null',()=>{
 const d=partnerDraft();assert.equal(partnerDirty({...d},d),false);assert.equal(partnerDirty({...d,type:'CUSTOMER'},d),true)
 assert.equal(partnerDirty({...d,notes:'  '},d),false);assert.equal(partnerRequest(d,'request').phone,null)
})

test('blank codes are delegated to the server and existing overseas classification survives editing',()=>{
 const d={...partnerDraft(),name:'자동 거래처'}
 for(const code of ['', '   ']){assert.equal(partnerError({...d,code}),null);assert.equal(partnerRequest({...d,code},'r').code,null)}
 assert.equal(partnerRequest({...d,code:' ABC-001 '},'r').code,'ABC-001')
 assert(partnerError({...d,code:'X'.repeat(65)}));assert(partnerError({...d,code:'AB\nCD'}))
 const p={id:'existing',version:'v',code:'OLD-1',name:'해외 거래처',type:'BOTH',registrationCountry:'OTHER',businessRegistrationNumber:'GB-123',isActive:true}
 const request=partnerRequest({...partnerDraft(p),name:'이름 수정'},'r',p)
 assert.equal(request.code,'OLD-1');assert.equal(request.registrationCountry,'OTHER');assert.equal(request.businessRegistrationNumber,'GB-123')
})

test('default shipping address is optional and independent from business address',()=>{
 const d=partnerDraft({name:'거래처',address:'사업장',addressDetail:'사무실',defaultShippingAddress:'안양 출고지',defaultShippingAddressDetail:'물류동'})
 const next={...d,defaultShippingAddress:'서울 출고지'}
 assert(partnerDirty(next,d))
 const r=partnerRequest(next,'request')
 assert.equal(r.address,'사업장');assert.equal(r.addressDetail,'사무실')
 assert.equal(r.defaultShippingAddress,'서울 출고지');assert.equal(r.defaultShippingAddressDetail,'물류동')
 const empty=partnerRequest({...next,defaultShippingAddress:'',defaultShippingAddressDetail:''},'request',d)
 assert.equal(empty.defaultShippingAddress,'');assert.equal(empty.defaultShippingAddressDetail,'')
 assert.equal(partnerDraft({name:'기존 거래처'}).defaultShippingAddress,'');assert.equal(partnerRequest(partnerDraft(),'r').defaultShippingAddress,undefined)
})

test('shipping postcode stays separate from business postcode and clears explicitly',()=>{
 const p={name:'거래처',postalCode:'11111',defaultShippingPostalCode:'22222',defaultShippingAddress:'출고지'}
 const d=partnerDraft(p);assert.equal(d.defaultShippingPostalCode,'22222')
 const request=partnerRequest({...d,defaultShippingPostalCode:'33333'},'r',p)
 assert.equal(request.postalCode,'11111');assert.equal(request.defaultShippingPostalCode,'33333')
 assert.equal(partnerRequest({...d,defaultShippingPostalCode:''},'r',p).defaultShippingPostalCode,'')
 assert.equal(partnerDraft({name:'기존 거래처'}).defaultShippingPostalCode,'')
})
