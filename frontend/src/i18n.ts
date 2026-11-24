import ko from './locales/ko/common.json' with { type: 'json' }
import en from './locales/en/common.json' with { type: 'json' }
export type Language = 'ko' | 'en'
const key = 'ieble-wms.language'
const listeners = new Set<() => void>()
function stored(): Language { try { return globalThis.localStorage?.getItem(key) === 'en' ? 'en' : 'ko' } catch { return 'ko' } }
let language: Language = stored()
export const getLanguage = () => language
export const getLocale = () => language === 'en' ? 'en-US' : 'ko-KR'
export function setLanguage(value: Language) {
  if (value !== 'ko' && value !== 'en') return
  language = value
  try { globalThis.localStorage?.setItem(key, value) } catch { /* Session remains usable when storage is unavailable. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = value
  listeners.forEach(listener => listener())
}
export function subscribeLanguage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
if (typeof window !== 'undefined') {
  document.documentElement.lang = language
  window.addEventListener('storage', event => { if (event.key === key) { language = stored(); document.documentElement.lang = language; listeners.forEach(listener => listener()) } })
}
const korean: Record<string, string> = ko, english: Record<string, string> = en
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Match only known UI message templates. Captured values are never translated.
const patterns = Object.keys(korean).filter(key => /\{v\d+\}/.test(key) && /[가-힣]/.test(key)).map(key => {
  const names = [...key.matchAll(/\{(v\d+)\}/g)].map(match => match[1])
  const parts = key.split(/\{v\d+\}/g)
  return { key, names, weight: parts.join('').length, expression: new RegExp('^' + parts.map(escapeRegex).join(parts.join('').length < 10 ? '([+-]?[0-9][0-9.,]*)' : '([\\s\\S]*?)') + '$') }
}).sort((a, b) => b.weight - a.weight)
// This template's first argument is a fixed packaging enum, not a business name.
const packagingMessage = '{v0} 수량이 설정되지 않았거나 올바르지 않습니다. 포장 수량을 복원하거나 바코드 적용 단위를 변경해 주세요.'
function translatedMessage(source: string, normalized: string): string {
  if (english[normalized] !== undefined) return english[normalized]
  if (normalized.length <= 5000) for (const pattern of patterns) {
    const match = pattern.expression.exec(normalized)
    if (match) return (english[pattern.key] ?? pattern.key).replace(/\{(v\d+)\}/g, (token, name: string) => {
      const index = pattern.names.indexOf(name)
      if (index < 0) return token
      const captured = match[index + 1]
      return pattern.key === packagingMessage && name === 'v0' && ['낱개', '인박스', '아웃박스', '파레트'].includes(captured) ? english[captured] : captured
    })
  }
  return source
}
/** Only call for authored UI messages, never product names, codes, notes or API payloads. */
export function t(source: string | number, values?: Record<string, unknown>): string {
  source = String(source)
  const normalized = source.replace(/\s+/g, ' ').trim()
  const translated = language === 'en' ? translatedMessage(source, normalized) : source
  return values ? translated.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match) : translated
}
