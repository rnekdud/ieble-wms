import test from 'node:test'
import assert from 'node:assert/strict'
import { revealMenuItem } from '../src/menu-scroll.ts'
const menu=()=>({clientHeight:100,clientTop:1,scrollTop:50,getBoundingClientRect:()=>({top:10})})
const item=(top,bottom,visible=true)=>({getClientRects:()=>visible?[{}]:[],getBoundingClientRect:()=>({top,bottom})})
test('already visible item keeps the menu position',()=>{const m=menu();revealMenuItem(m,item(15,60));assert.equal(m.scrollTop,50)})
test('scrolls only by the clipped amount in either direction',()=>{const m=menu();revealMenuItem(m,item(80,130));assert.equal(m.scrollTop,69);revealMenuItem(m,item(5,45));assert.equal(m.scrollTop,63)})
test('hidden items and a closed viewport do not scroll',()=>{const m=menu();revealMenuItem(m,item(200,240,false));assert.equal(m.scrollTop,50);m.clientHeight=0;revealMenuItem(m,item(200,240));assert.equal(m.scrollTop,50)})
test('oversize menu item aligns its start without overscrolling',()=>{const m=menu();revealMenuItem(m,item(30,180));assert.equal(m.scrollTop,69)})
