import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fitLabelZoom,pixelsPerMm,pointerDeltaMm,zoomPanAt,clampZoom} from '../src/label-editor/viewport.ts'
for(const [width,height] of [[280,200],[600,400],[1100,700]])for(const [labelWidth,labelHeight] of [[99.1,33.9],[63.5,38.1],[210,297],[10,10]])test(`fit ${labelWidth}x${labelHeight} in ${width}x${height}`,()=>{
 const zoom=fitLabelZoom(width,height,labelWidth,labelHeight),w=labelWidth*pixelsPerMm*zoom,h=labelHeight*pixelsPerMm*zoom
 assert(w<=width-48+.001);assert(h<=height-48+.001);assert(Math.abs(w/(width-48)-1)<.001||Math.abs(h/(height-48)-1)<.001);assert(Math.abs(w/h-labelWidth/labelHeight)<1e-10)
 const delta=pointerDeltaMm(7.5*pixelsPerMm*zoom,3*pixelsPerMm*zoom,w,h,labelWidth,labelHeight);assert(Math.abs(delta.x-7.5)<1e-10);assert(Math.abs(delta.y-3)<1e-10)
})
test('viewport calculations never mutate paper or require saved geometry changes',()=>{assert.equal(fitLabelZoom(0,0,99.1,33.9),1);for(const zoom of [.25,1,2,4])assert.deepEqual(pointerDeltaMm(0,0,99.1*pixelsPerMm*zoom,33.9*pixelsPerMm*zoom,99.1,33.9),{x:0,y:0})})

for(const previousZoom of [.5,1,2])test(`pointer-anchored zoom and print mm remain independent at ${previousZoom}`,()=>{
 const pan={x:120,y:-35},anchor={x:25,y:80},nextZoom=previousZoom*1.5,next=zoomPanAt(pan,previousZoom,nextZoom,anchor)
 for(const axis of ['x','y'])assert(Math.abs((anchor[axis]-pan[axis])/previousZoom-(anchor[axis]-next[axis])/nextZoom)<1e-10)
 const restored=zoomPanAt(next,nextZoom,previousZoom,anchor);assert(Math.abs(restored.x-pan.x)<1e-10);assert(Math.abs(restored.y-pan.y)<1e-10)
 const delta=pointerDeltaMm(7.5*pixelsPerMm*nextZoom,3*pixelsPerMm*nextZoom,99.1*pixelsPerMm*nextZoom,33.9*pixelsPerMm*nextZoom,99.1,33.9);assert(Math.abs(delta.x-7.5)<1e-10);assert(Math.abs(delta.y-3)<1e-10)
 assert.deepEqual(pan,{x:120,y:-35})
})
test('zoom limits are bounded',()=>{assert.equal(clampZoom(.001),.1);assert.equal(clampZoom(200),32)})
