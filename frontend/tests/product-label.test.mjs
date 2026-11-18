import {test} from 'node:test'
import assert from 'node:assert/strict'
import {productLabelIdentity,labelPrintTitle} from '../src/product-label.ts'
test('product identity uses real name and unchanged code, with spaced middle dot',()=>{
 assert.equal(productLabelIdentity('가나디 무드등 가습기','PR06'),'가나디 무드등 가습기 · PR06')
 assert.equal(productLabelIdentity('  메로나  ','pr03'),'메로나 · pr03')
 assert.equal(productLabelIdentity('메로나',''),'메로나')
 assert.equal(productLabelIdentity(undefined,'PR03'),'PR03')
 assert.equal(productLabelIdentity('',''), '')
})
test('only print job / PDF default titles sanitize forbidden filename characters',()=>{
 const identity=productLabelIdentity('한글 & <제품> / "A" : 12?','Pr06')
 assert.equal(identity,'한글 & <제품> / "A" : 12? · Pr06')
 assert.equal(labelPrintTitle(identity),'한글 & _제품_ _ _A_ _ 12_ · Pr06')
 assert.equal(labelPrintTitle('메로나 · PR03'),'메로나 · PR03')
})
