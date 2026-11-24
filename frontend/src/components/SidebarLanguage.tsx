import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Globe } from 'lucide-react'
import { setLanguage, type Language } from '../i18n.ts'
import { useLanguage } from '../use-language'
import './sidebar-language.css'

const languages = [{ code: 'ko', name: '한국어' }, { code: 'en', name: 'English' }] as const
export default function SidebarLanguage({ collapsed = false }: { collapsed?: boolean }) {
  const language = useLanguage(), id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<{ left: number; top: number; host: HTMLElement } | null>(null)
  const current = languages.find(item => item.code === language)!
  const close = (restore = false) => { setPopup(null); if (restore) trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!popup) return
    menu.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus({ preventScroll: true })
    const outside = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setPopup(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); setPopup(null); trigger.current?.focus({ preventScroll: true })
    }
    const resized = () => setPopup(null)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', resized)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', resized)
    }
  }, [popup])
  function toggle() {
    if (popup) { close(); return }
    const button = trigger.current!, rect = button.getBoundingClientRect()
    const host = button.closest('dialog') || document.body
    const boundary = host instanceof HTMLDialogElement ? host.getBoundingClientRect() : { left: 0, right: innerWidth }
    setPopup({ host, left: Math.max(boundary.left + 8, Math.min(rect.left, boundary.right - 184)), top: Math.max(8, rect.top - 104) })
  }
  function select(value: Language) { setLanguage(value); close(true) }
  return <div className={`sidebar-language${collapsed ? ' is-collapsed' : ''}`}>
    <button ref={trigger} type="button" className="sidebar-language-trigger" aria-label={current.name} aria-haspopup="menu" aria-expanded={!!popup} aria-controls={popup ? id : undefined} title={collapsed ? current.name : undefined} onClick={toggle} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!popup) toggle() } }}>
      <Globe size={19} aria-hidden="true" /><span hidden={collapsed}>{current.name}</span>
    </button>
    {popup && createPortal(<div ref={menu} id={id} className="sidebar-language-menu" role="menu" aria-label={current.name} style={{ left: popup.left, top: popup.top }} onKeyDown={event => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') || [])
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>
      {languages.map(item => <button key={item.code} type="button" role="menuitemradio" aria-checked={language === item.code} lang={item.code} onClick={() => select(item.code)}><Check size={16} aria-hidden="true" style={{ visibility: language === item.code ? 'visible' : 'hidden' }} /><span>{item.name}</span></button>)}
    </div>, popup.host)}
  </div>
}
