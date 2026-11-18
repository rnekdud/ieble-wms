import { barcodeGraphic } from './rack-barcode'

/** Six pixels per module: 600 dpi at the SVG's 0.254 mm/module physical size. */
export async function barcodeImageBlob(graphic: ReturnType<typeof barcodeGraphic>, format: 'png' | 'jpg'): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([graphic.svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = graphic.modules * 6
    canvas.height = 126 * 6
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지를 생성할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('이미지를 다운로드하지 못했습니다. 다시 시도해 주세요.'))
    }, format === 'png' ? 'image/png' : 'image/jpeg', 1))
  } finally { URL.revokeObjectURL(url) }
}
