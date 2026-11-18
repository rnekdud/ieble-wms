import test from 'node:test'
import assert from 'node:assert/strict'
import { Code128Reader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'
import { barcodeError, barcodeBits, barcodeGraphic, barcodeChanged, barcodeInputChange, barcodeInputValue, barcodeFilename } from '../src/rack-barcode.ts'
import { emptyWorkspace, newStructure, workspaceRequest, workspaceError, emptyVersion } from '../src/warehouse-workspace-model.ts'
import { blankPlan } from '../src/warehouse-plan-model.ts'

for (const value of ['IBR-0123456789ABCDEF0123456789ABCDEF', '00001234567890', ' legacy-Aa/01<&"\' ', 'A'.repeat(64), ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']) {
  test(`Code 128 independently decodes printable input (${value.length} characters)`, () => {
    assert.equal(barcodeError(value), null)
    const bits=barcodeBits(value),width=(bits.length+20)*3,height=100,pixels=new Uint8ClampedArray(width*height).fill(255)
    for(let y=0;y<height;y++) for(let i=0;i<bits.length;i++) if(bits[i]==='1') for(let dot=0;dot<3;dot++) pixels[y*width+(i+10)*3+dot]=0
    const bitmap=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height)))
    assert.equal(new Code128Reader().decode(bitmap).getText(),value)
    const graphic=barcodeGraphic(value);assert.equal(graphic.modules,bits.length+20);assert.equal(graphic.widthMm,Number(((bits.length+20)*0.254).toFixed(3)));assert(graphic.widthMm<=200)
  })
}
test('invalid scanner data and overlength input are rejected instead of truncated',()=>{
  for(const value of ['', '한글', 'é', 'ABC\r\n', 'ABC\n', 'TAB\t', '\x7f', 'x'.repeat(65)]){assert(barcodeError(value));assert.throws(()=>barcodeGraphic(value))}
  const svg=barcodeGraphic('<script>&"').svg;assert(!svg.includes('<script>'));assert(svg.includes('&lt;script&gt;&amp;&quot;'))
})
test('workspace carries barcode changes separately from stable identities and validates duplicate drafts',()=>{
  const draft=emptyWorkspace();draft.warehouse.name='창고';const rack=newStructure('r1','랙');rack.code='R';rack.barcodeChange={mode:'manual',value:' old-01 '};draft.racks=[rack]
  const body=workspaceRequest(draft,blankPlan(),emptyVersion,false,'request');assert.deepEqual(body.racks[0].barcode,rack.barcodeChange);assert.equal(body.racks[0].clientId,'r1');assert.equal(body.racks[0].code,'R')
  assert.equal(workspaceError(draft,blankPlan()),null);draft.racks.push({...rack,clientId:'r2',code:'R2'});assert.match(workspaceError(draft,blankPlan()),/바코드가 중복/)
})

test('reverting a barcode or keeping an empty value does not mark the rack dirty',()=>{
  assert.equal(barcodeChanged('ABC',{mode:'manual',value:'ABC'}),false)
  assert.equal(barcodeChanged(null,{mode:'none'}),false)
  assert.equal(barcodeChanged('ABC',{mode:'auto'}),true)
  assert.equal(barcodeChanged(undefined,{mode:'auto'},true),false)
  assert.equal(barcodeChanged(undefined,{mode:'none'},true),false)
})


test('one editable input preserves generated candidates and restores unchanged values',()=>{
  const generated={mode:'auto',value:'IBR-123',proof:'signed'}
  assert.equal(barcodeInputValue(generated,'OLD'),'IBR-123')
  assert.equal(barcodeInputValue({mode:'keep'},'OLD'),'OLD')
  assert.equal(barcodeInputValue({mode:'none'},'OLD'),'')
  assert.deepEqual(barcodeInputChange('OLD','OLD'),{mode:'keep'})
  assert.deepEqual(barcodeInputChange('','OLD'),{mode:'none'})
  assert.deepEqual(barcodeInputChange('',''),{mode:'keep'})
  assert.deepEqual(barcodeInputChange(' New/scan ','OLD'),{mode:'manual',value:' New/scan '})
  const draft=emptyWorkspace();draft.warehouse.name='창고';const rack=newStructure('r1','랙');rack.code='R';rack.barcodeChange=generated;draft.racks=[rack]
  assert.deepEqual(workspaceRequest(draft,blankPlan(),emptyVersion,false,'request').racks[0].barcode,generated)
  draft.racks.push({...rack,clientId:'r2',code:'R2',barcodeChange:{mode:'manual',value:generated.value}})
  assert.match(workspaceError(draft,blankPlan()),/바코드가 중복/)
  rack.barcodeChange=undefined;draft.racks=[rack]
  assert.deepEqual(workspaceRequest(draft,blankPlan(),emptyVersion,false,'request').racks[0].barcode,{mode:'none'})
})
test('download names safely retain rack and barcode identity in every supported format',()=>{
  for(const ext of ['png','jpg','svg']) {
    const name=barcodeFilename('한글/랙:*?','../CON<>&"',ext)
    assert.equal(name,`rack-한글_랙-CON.${ext}`)
    assert(!/[\\/:*?"<>|\x00-\x1f]/.test(name))
  }
  assert(barcodeFilename('R'.repeat(200),'B'.repeat(200),'png').length<150)
  assert.equal(barcodeFilename('','','jpg'),'rack-rack-barcode.jpg')
})

test('numeric internal IDs retain Code 128 and all label owner names',()=>{
 const value='88000000000000000001';assert.equal(barcodeError(value),null);assert.equal(barcodeError('   ')===null,false);
 assert.equal(barcodeError(' Legacy-Aa/01 '),null);assert(barcodeGraphic(value).svg.includes(value));
 for(const kind of ['product','rack','location']) for(const ext of ['png','jpg','svg']) assert(barcodeFilename('대상/01',value,ext,kind).startsWith(kind+'-대상_01-'));
})
