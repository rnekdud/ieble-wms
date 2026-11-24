import { barcodeBits, escapeXml } from '../rack-barcode.ts'
import { outside, paperError, position, perPage } from './model.ts'
import type { Design, LabelObject, Paper } from './model.ts'
const mmPerPt=25.4/72
export const fontFamily=(font:LabelObject['font'])=>font==='serif'?'Georgia, "Times New Roman", serif':font==='monospace'?'"Courier New", monospace':'Arial, "Malgun Gothic", sans-serif'
let measure:CanvasRenderingContext2D|null=null
export function textLines(o:LabelObject):string[]{
 measure??=document.createElement('canvas').getContext('2d');if(!measure)return o.text.split('\n')
 measure.font=`${o.bold?'bold ':''}${o.fontSize*96/72}px ${fontFamily(o.font)}`
 const limit=Math.max(.1,o.width-.8)*96/25.4,lines:string[]=[]
 for(const part of o.text.split('\n')){let line='';for(const c of part){if(line&&measure.measureText(line+c).width>limit){lines.push(line);line=''}line+=c}lines.push(line)}return lines
}
export function renderObject(o:LabelObject,d:Design):string {
 const x=escapeXml,cx=o.x+o.width/2,cy=o.y+o.height/2;let content=''
 if(o.kind==='text'){const size=o.fontSize*mmPerPt;const anchor=o.align==='center'?'middle':o.align==='right'?'end':'start';const tx=o.align==='center'?o.width/2:o.align==='right'?o.width-.4:.4;content=`<text fill="${x(o.color)}" font-family="${x(fontFamily(o.font))}" font-size="${size}" font-weight="${o.bold?'700':'400'}" text-anchor="${anchor}" xml:space="preserve">${textLines(o).map((line,i)=>`<tspan x="${tx}" y="${.4+size*(1+i*1.25)}">${x(line)}</tspan>`).join('')}</text>`}
 if(o.kind==='image'&&d.images[o.imageId])content=`<image href="${x(d.images[o.imageId])}" width="${o.width}" height="${o.height}" preserveAspectRatio="xMidYMid meet"/>`
 if(o.kind==='barcode'){
  try{const bits=barcodeBits(o.text),modules=bits.length+20,pitch=o.width/modules,caption=o.showValue?Math.min(4,o.height*.25):0,barHeight=o.height-caption;
   content=`<rect width="${o.width}" height="${o.height}" fill="white"/>`+[...bits.matchAll(/1+/g)].map(m=>`<rect x="${(10+m.index!)*pitch}" width="${m[0].length*pitch}" height="${barHeight}" fill="black"/>`).join('')+(o.showValue?`<text x="${o.width/2}" y="${barHeight+caption*.8}" text-anchor="middle" font-size="${Math.min(caption*.7,o.width/Math.max(1,o.text.length)*1.4)}" font-family="monospace" xml:space="preserve">${x(o.text)}</text>`:'')
  }catch{content=`<rect width="${o.width}" height="${o.height}" fill="#fff4f4" stroke="#b42318" stroke-width=".2"/><text x="1" y="4" font-size="3" fill="#b42318">CODE128</text>`}
 }
 if(o.kind==='rectangle')content=`<rect x="${o.strokeWidth/2}" y="${o.strokeWidth/2}" width="${Math.max(0,o.width-o.strokeWidth)}" height="${Math.max(0,o.height-o.strokeWidth)}" fill="${x(o.fill==='transparent'?'none':o.fill)}" stroke="${x(o.color)}" stroke-width="${o.strokeWidth}"/>`
 if(o.kind==='line')content=`<line x1="0" y1="${o.height/2}" x2="${o.width}" y2="${o.height/2}" stroke="${x(o.color)}" stroke-width="${o.strokeWidth}"/>`
 return `<g transform="rotate(${o.rotation} ${cx} ${cy})"><svg x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" overflow="hidden">${content}</svg></g>`
}
export function labelSvg(d:Design,index:number,test=false):string {
 const p=d.paper;return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.labelWidth}mm" height="${p.labelHeight}mm" viewBox="0 0 ${p.labelWidth} ${p.labelHeight}"><rect width="100%" height="100%" fill="white"/>${test?`<rect x=".2" y=".2" width="${p.labelWidth-.4}" height="${p.labelHeight-.4}" fill="none" stroke="black" stroke-width=".2"/><path d="M0 5H10M5 0V10" stroke="black" stroke-width=".2"/><text x="12" y="6" font-size="3">${index+1} / 10 mm</text>`:d.labels[index].objects.map(o=>renderObject(o,d)).join('')}</svg>`
}
export function sheetSvg(d:Design,page:number,indices:number[],test=false){const p=d.paper;return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}mm" height="${p.height}mm" viewBox="0 0 ${p.width} ${p.height}"><rect width="100%" height="100%" fill="white"/>${indices.filter(i=>Math.floor(i/perPage(p))===page).map(i=>{const pos=position(p,i);return `<g transform="translate(${pos.x+d.offsetX} ${pos.y+d.offsetY})">${labelSvg(d,i,test).replace(`width="${p.labelWidth}mm"`, `width="${p.labelWidth}"`).replace(`height="${p.labelHeight}mm"`, `height="${p.labelHeight}"`)}</g>`}).join('')}</svg>`}
export function printErrors(d:Design,indices:number[]):string[]{const errors:string[]=[];const p=d.paper;const pe=paperError(p);if(pe)return [pe];if(![d.offsetX,d.offsetY].every(v=>Number.isFinite(v)&&Math.abs(v)<=10))return ['출력 보정값은 -10~10mm입니다.'];for(const i of indices){const pos=position(p,i);if(pos.x+d.offsetX<0||pos.y+d.offsetY<0||pos.x+d.offsetX+p.labelWidth>p.width+.01||pos.y+d.offsetY+p.labelHeight>p.height+.01)errors.push(`${i+1}: 보정된 라벨이 용지를 벗어납니다.`)
 for(const o of d.labels[i].objects){if(![o.x,o.y,o.width,o.height,o.rotation,o.fontSize,o.strokeWidth].every(Number.isFinite)||o.width<.2||o.height<.2||o.fontSize<4||o.fontSize>200||Math.abs(o.rotation)>360||o.strokeWidth<0||o.strokeWidth>5){errors.push(`${i+1}: 객체 크기와 서식을 확인해 주세요.`);continue}if(o.kind==='image'&&!d.images[o.imageId])errors.push(`${i+1}: 이미지가 누락되었습니다.`);if(outside(o,p))errors.push(`${i+1}: 객체가 라벨 영역을 벗어납니다.`);if(o.kind==='text'&&.4+o.fontSize*mmPerPt*(1+(textLines(o).length-1)*1.25)>o.height)errors.push(`${i+1}: 텍스트 상자의 높이를 늘려 주세요.`);if(o.kind==='barcode'){try{const bits=barcodeBits(o.text);if(o.width/(bits.length+20)<.254)errors.push(`${i+1}: 바코드 폭을 ${Math.ceil((bits.length+20)*.254)}mm 이상으로 늘려 주세요.`)}catch{errors.push(`${i+1}: 바코드 값을 확인해 주세요.`)}}}}
 return [...new Set(errors)]
}
export async function raster(svg:string,p:Pick<Paper,'labelWidth'|'labelHeight'>,dpi=300):Promise<string>{
 await document.fonts.ready
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=Math.ceil(p.labelWidth/25.4*dpi);canvas.height=Math.ceil(p.labelHeight/25.4*dpi);if(canvas.width*canvas.height>40000000)throw new Error('이미지 크기를 줄여 주세요.');const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png')}finally{URL.revokeObjectURL(url)}
}
export function printHtml(d:Design,indices:number[],test=false){const pages=[...new Set(indices.map(i=>Math.floor(i/perPage(d.paper))))];return `<!doctype html><html><head><meta charset="utf-8"><title>WMS Labels</title><style>@page{size:${d.paper.width}mm ${d.paper.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:${d.paper.width}mm;height:${d.paper.height}mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:100%;height:100%}</style></head><body>${pages.map(page=>`<section>${sheetSvg(d,page,indices,test)}</section>`).join('')}</body></html>`}
