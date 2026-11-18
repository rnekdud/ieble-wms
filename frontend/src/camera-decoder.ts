import { cameraFormats, type BarcodeDetectorConstructor } from './barcode-scan'
export type CameraDecoder = { detect: (video: HTMLVideoElement) => Promise<string[]>; dispose: () => void }
/** Reuse the installed ZXing decoder when the browser lacks native barcode detection (e.g. Safari). */
export async function createCameraDecoder(): Promise<CameraDecoder> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (Detector) {
    try {
      const formats = (await Detector.getSupportedFormats()).filter(format => cameraFormats.includes(format))
      if (formats.length) {
        const detector = new Detector({ formats })
        return { detect: async video => [...new Set((await detector.detect(video)).map(item => item.rawValue).filter(Boolean))], dispose: () => {} }
      }
    } catch { /* A supported browser may still lack a usable detector; use the existing decoder. */ }
  }
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat, NotFoundException, ChecksumException, FormatException } = await import('@zxing/library')
  const formats = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]
  const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, formats]]))
  return { detect: async video => {
    try { return [reader.decode(video).getText()] }
    catch (error) { if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return []; throw error }
  }, dispose: () => reader.reset() }
}
