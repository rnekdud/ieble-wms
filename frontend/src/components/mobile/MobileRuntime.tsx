import { t as uiText } from '../../i18n.ts'
import { isAndroidApp, isNativeApp } from '../../native-environment'
import './mobile.css'
import { observeInstall } from '../../mobile-install'
import { useEffect, useState } from 'react'
import { useMobile } from '../../use-mobile'

export default function MobileRuntime() {
  const mobile = useMobile()
  useEffect(observeInstall, [])
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork)
    return () => { window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork) }
  }, [])
  useEffect(() => {
    if (!mobile) return
    const metadata: HTMLElement[] = []
    for (const [tag, attributes] of [
      ['link', { rel: 'manifest', href: '/manifest.webmanifest' }],
      ['link', { rel: 'apple-touch-icon', href: '/app-icon-192.png' }],
      ['meta', { name: 'theme-color', content: '#16345F' }],
      ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
      ['meta', { name: 'apple-mobile-web-app-title', content: 'IEBLE WMS' }],
    ] as const) {
      const element = document.createElement(tag)
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
      document.head.append(element); metadata.push(element)
    }
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name=viewport]')
    const previousViewport = viewportMeta?.content
    if (viewportMeta) viewportMeta.content = `width=device-width, initial-scale=1.0, viewport-fit=${isAndroidApp() ? 'contain' : 'cover'}, interactive-widget=resizes-content`
    const viewport = window.visualViewport
    const update = () => {
      const height = viewport?.height ?? window.innerHeight
      const editing = document.activeElement?.matches('input,textarea,[contenteditable=true]')
      document.documentElement.style.setProperty('--mobile-viewport-height', `${height}px`)
      document.documentElement.dataset.mobileKeyboard = String(!!editing && window.innerHeight - height > 120)
    }
    update(); viewport?.addEventListener('resize', update); window.addEventListener('resize', update); document.addEventListener('focusin', update); document.addEventListener('focusout', update)
    if (!isNativeApp() && 'serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/mobile-sw.js', { scope: '/' }).catch(() => { /* Online workflows do not depend on installation. */ })
    return () => { metadata.forEach(element => element.remove()); if (viewportMeta && previousViewport !== undefined) viewportMeta.content = previousViewport; viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); delete document.documentElement.dataset.mobileKeyboard; document.documentElement.style.removeProperty('--mobile-viewport-height') }
  }, [mobile])
  return mobile && !online ? <div className="mobile-offline" role="alert">{uiText("네트워크 연결이 끊겼습니다. 저장·확정 결과를 확인한 뒤 다시 시도하세요.")}</div> : null
}
