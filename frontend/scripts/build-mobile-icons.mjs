// Render the existing brand symbol into install assets; no new logo or UI imagery.
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
const svg = await readFile(new URL('../public/wms_logo.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
 const page = await browser.newPage()
 for (const size of [192,512]) {
  const base64 = await page.evaluate(async ({svg,size}) => {
   const image = new Image(); image.src = 'data:image/svg+xml;base64,'+btoa(svg); await image.decode()
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size
   const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,size,size)
   const ratio=Math.min(size*.6/image.width,size*.6/image.height)
   ctx.drawImage(image,(size-image.width*ratio)/2,(size-image.height*ratio)/2,image.width*ratio,image.height*ratio)
   return canvas.toDataURL('image/png').split(',')[1]
  },{svg,size})
  await writeFile(new URL(`../public/app-icon-${size}.png`,import.meta.url),Buffer.from(base64,'base64'))
 }
} finally {await browser.close()}
