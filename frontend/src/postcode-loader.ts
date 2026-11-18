import type { PostcodeResult } from './address-model'
export const postcodeScriptUrl = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
type PostcodeOptions = {
  oncomplete: (result: PostcodeResult) => void
  onresize: (size: { width: number; height: number }) => void
  width: string
  height: string
  minWidth: number
}
export type PostcodeConstructor = new (options: PostcodeOptions) => { embed: (element: HTMLElement) => void }
declare global {
  interface Window {
    kakao?: { Postcode?: PostcodeConstructor }
    daum?: { Postcode?: PostcodeConstructor }
  }
}
let pending: Promise<PostcodeConstructor> | undefined
const available = () => window.kakao?.Postcode || window.daum?.Postcode
export function loadPostcode(): Promise<PostcodeConstructor> {
  const ready = available()
  if (ready) return Promise.resolve(ready)
  if (pending) return pending
  pending = new Promise<PostcodeConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${postcodeScriptUrl}"]`)
    const script = existing || document.createElement('script')
    const clean = () => { window.clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed) }
    const failed = () => { clean(); script.remove(); reject(new Error('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')) }
    const loaded = () => { const constructor = available(); if (!constructor) { failed(); return }; clean(); resolve(constructor) }
    const timer = window.setTimeout(failed, 15000)
    script.addEventListener('load', loaded)
    script.addEventListener('error', failed)
    if (!existing) { script.src = postcodeScriptUrl; script.async = true; document.head.append(script) }
  }).catch(error => { pending = undefined; throw error })
  return pending
}
