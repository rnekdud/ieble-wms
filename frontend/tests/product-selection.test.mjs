import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshSelection, selectedProducts } from '../src/product-selection-model.ts'
import { appendImportedProducts } from '../src/document-paste.ts'
import { lineQuantityError, lineTrackingError, shipmentLineError, serialTextError } from '../src/document-line-model.ts'
const product={id:'p',name:'상품',code:'P',unit:'EA',requestable:70,physical:100,reserved:30,available:70,ownReserved:0}
const line=(quantity,patch={})=>({key:'first',product,quantity,lot:'',expiry:'',serialText:'',...patch})
test('상품 선택은 빈 수량을 반환하며 기존 행·추적정보·ID를 보존한다',()=>{
 const original=[line('2',{lineId:'old',lot:'LOT-A',serialText:'A\nB',placements:[{locationId:'loc'}]})], snapshot=structuredClone(original)
 const selected={p:{product},q:{product:{...product,id:'q',unit:'kg'}}}
 const added=appendImportedProducts(original,selectedProducts(selected),()=>({quantity:'',lot:'',expiry:'',serialText:'',lineId:'',placements:[]}))
 assert.deepEqual(original,snapshot);assert.strictEqual(added[0],original[0]);assert.equal(added.length,3)
 assert.equal(added[1].quantity,'');assert.equal(added[1].lot,'');assert.equal(added[2].product.unit,'kg')
 assert.ok(lineQuantityError(added[1]))
})
test('검색·페이지 변경과 새 조회에서도 상품 선택을 유지하며 자동 수량을 만들지 않는다',()=>{
 const original={p:{product},q:{product:{...product,id:'q'}}},next=refreshSelection(original,[{...product,requestable:10}])
 assert.equal(next.p.product.requestable,10);assert.ok(next.q);assert.equal(original.p.product.requestable,70)
 assert.deepEqual(selectedProducts(next).map(p=>p.quantity),['',''])
})
test('테이블 수량은 기준 단위의 정수·소수 규칙과 검수 0 허용을 적용한다',()=>{
 for(const q of ['', '0','-1','1.0001','1.5'])assert.ok(lineQuantityError(line(q)))
 assert.equal(lineQuantityError(line('2')),'')
 assert.equal(lineQuantityError(line('1.125',{product:{...product,unit:'kg'}})),'')
 assert.equal(lineQuantityError(line('0'),true),'');assert.ok(lineQuantityError(line(''),true))
})
test('출고는 같은 상품·단위만 합산하고 해당 문서 예약을 재사용한다',()=>{
 const first=line('30'),second=line('41',{key:'second'}),other=line('999',{key:'other',product:{...product,id:'other'}}),different=line('999',{key:'diff',product:{...product,unit:'kg'}})
 assert.match(shipmentLineError(first,[first,second,other,different],product),/71.*70/)
 assert.equal(shipmentLineError(first,[first,second,other,different],{...product,requestable:100,ownReserved:30}),'')
 assert.ok(shipmentLineError(different,[different],product));assert.ok(shipmentLineError(first,[first]))
})
test('선택적인 LOT·유통기한·시리얼은 비워 둘 수 있지만 중복·개수 오류는 차단한다',()=>{
 const blank=line('2');assert.equal(lineTrackingError(blank,[blank]),'')
 assert.ok(serialTextError('A\nA'));assert.ok(serialTextError('A\u0001'));assert.equal(serialTextError('A\nB'),'')
 const one=line('2',{serialText:'A'});assert.ok(lineTrackingError(one,[one]))
 const a=line('1',{serialText:'A'}),b=line('1',{key:'second',serialText:'A'});assert.match(lineTrackingError(a,[a,b]),/다른 행/)
})
test('엑셀 붙여넣기는 선택 전용 팝업과 달리 입력 수량을 그대로 행에 반영한다',()=>{
 const rows=appendImportedProducts([line('2')],[{product,quantity:'5'}],()=>line(''))
 assert.equal(rows.length,2);assert.equal(rows[0].quantity,'2');assert.equal(rows[1].quantity,'5')
})
