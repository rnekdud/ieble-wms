import assert from 'node:assert/strict'
import {test} from 'node:test'
import {barcodePackageError,barcodePackageSummary,packageFactors,packagingError} from '../src/product-packaging.ts'
import {productDraft,productRequest} from '../src/product-model.ts'
import {barcodeDrafts,barcodePayload} from '../src/product-master-model.ts'
test('EA is implicit and packaging multiplies only declared hierarchy',()=>{
 assert.equal(productRequest(productDraft(),{mode:'none'},'id').unit,'EA')
 for(const [inner,outer,total] of [[10,5,50],[12,8,96],[20,4,80]])assert.equal(packageFactors({innerPackQuantity:inner,outerPackQuantity:outer}).OUTER,total)
 assert.deepEqual(packageFactors({innerPackQuantity:10,outerPackQuantity:5,palletPackQuantity:20}),{EA:1,INNER:10,OUTER:50,PALLET:1000})
 assert.equal(packageFactors({outerPackQuantity:24,outerPackUnit:'EA'}).OUTER,24)
 for(const p of [{innerPackQuantity:0},{innerPackQuantity:1.5},{outerPackQuantity:5},{palletPackQuantity:2},{innerPackQuantity:999999999,outerPackQuantity:2}])assert.ok(packagingError(p))
})
test('editing preserves legacy unit and barcode package identity',()=>{
 assert.equal(productRequest(productDraft({unit:'BOX'}),{mode:'keep'},'id',{unit:'BOX',version:'v'}).unit,'BOX')
 const rows=barcodeDrafts({barcodes:[{id:'b',value:'label',packageCode:'OUTER',isPrimary:true,barcodeType:'External'}]})
 assert.equal(barcodePayload(rows)[0].packageCode,'OUTER');assert.equal(barcodePayload(rows)[0].id,'b')
})

test('barcode mapping requires a configured valid stage and preserves legacy meaning',()=>{
 const p={innerPackQuantity:10,outerPackQuantity:5,palletPackQuantity:20,unit:'EA'}
 for(const code of ['EA','INNER','OUTER','PALLET'])assert.equal(barcodePackageError(p,'EA',code),null)
 assert.equal(barcodePackageSummary(p,'PALLET'),'파레트 · 1,000 EA')
 assert.match(barcodePackageError({...p,innerPackQuantity:null},'EA','OUTER'),/수량/)
 assert.match(barcodePackageError({innerPackQuantity:1.5},'EA','INNER'),/올바르지/)
 assert.ok(barcodePackageError(p,'EA','UNKNOWN'))
 assert.equal(barcodePackageSummary({...p,unit:'BOX'}),'기존 단위 · 1 BOX (자동 환산 없음)')
 assert.ok(barcodePackageError(p,'BOX','INNER'))
 assert.equal(barcodePackageSummary({unit:'EA'}),'낱개 · 1 EA')
})
