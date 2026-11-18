import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rackDimensionChange as change} from '../src/rack-dimensions.ts'
test('valid dimensions patch the same shared rack without touching identity or barcode',()=>{const r={levels:3,bays:4,id:'fixed',barcode:'original'};assert.deepEqual(change(r,'levels','5'),{error:'',patch:{levels:5}});assert.deepEqual(r,{levels:3,bays:4,id:'fixed',barcode:'original'})})
test('invalid or excessive values never return a draft patch',()=>{for(const raw of ['', '-1','0','2.5','101','1e2']){const result=change({levels:3,bays:4},'levels',raw);assert(result.error);assert.equal(result.patch,undefined)}assert(change({levels:20,bays:50},'levels','21').error)})
test('saved rack minimums preserve original locations while allowing expansion',()=>{const r={levels:5,bays:6,minimumLevels:3,minimumBays:4};assert(change(r,'levels','2').error);assert(change(r,'bays','3').error);assert.deepEqual(change(r,'levels','3').patch,{levels:3});assert.deepEqual(change(r,'bays','7').patch,{bays:7})})
