// Derive iOS install assets from the existing WMS symbol; Android assets are untouched.
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
const svg = await readFile(new URL('../public/wms_logo.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  for (const [size, fraction, files] of [
    [1024, .6, ['AppIcon.appiconset/AppIcon-512@2x.png']],
    [2732, .16, ['Splash.imageset/splash-2732x2732.png', 'Splash.imageset/splash-2732x2732-1.png', 'Splash.imageset/splash-2732x2732-2.png']],
  ]) {
    const base64 = await page.evaluate(async ({ svg, size, fraction }) => {
      const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(svg); await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size)
      const ratio = Math.min(size * fraction / image.width, size * fraction / image.height)
      ctx.drawImage(image, (size - image.width * ratio) / 2, (size - image.height * ratio) / 2, image.width * ratio, image.height * ratio)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { svg, size, fraction })
    for (const file of files) await writeFile(new URL('../ios/App/App/Assets.xcassets/' + file, import.meta.url), Buffer.from(base64, 'base64'))
  }
} finally { await browser.close() }
