import { useCallback, useEffect, useRef, useState } from 'react'
import { revealMenuItem } from './menu-scroll'
import { findWorkspacePage, workspaceMenus } from './components/workspace/navigation'

const singleGroup = (label?: string): Record<string, boolean> => Object.fromEntries(workspaceMenus.filter(menu => menu.children).map(menu => [menu.label, menu.label === label]))

export function useMenuExpansion(path: string, visible = true) {
  const active = findWorkspacePage(path)?.path
  const parent = workspaceMenus.find(menu => menu.children?.some(page => page.path === active))?.label
  const [state, setState] = useState<{ path: string; visible: boolean; groups: Record<string, boolean> }>(() => ({ path, visible, groups: singleGroup(parent) }))
  // Route-scoped state adjustment happens before the children are committed.
  // User toggles on the same route remain untouched, including closing its group.
  if (state.path !== path || state.visible !== visible) setState({ path, visible, groups: visible ? singleGroup(parent) : state.groups })
  return [state.groups, (label: string, open?: boolean) => setState(previous => ({ path, visible, groups: singleGroup((open ?? !previous.groups[label]) ? label : undefined) }))] as const
}

export function useMenuScroll(path: string, visible = true, mobile = false, collapsed = false) {
  const menu = useRef<HTMLElement>(null)
  const positions = useRef({ expanded: 0, collapsed: 0 })
  const toggleFrame = useRef<number | undefined>(undefined)
  // Reveal only the group just operated (or its active child), never reopen
  // another group just because its page remains active.
  const revealToggle = useCallback((button: HTMLElement) => {
    cancelAnimationFrame(toggleFrame.current ?? 0)
    toggleFrame.current = requestAnimationFrame(() => {
      const nav = menu.current
      const container = mobile ? nav?.closest<HTMLElement>('.dialog-body') : nav
      if (!container || !button.isConnected) return
      const selected = button.closest('.wms-nav-group,.mobile-menu-group')?.querySelector<HTMLElement>('[aria-current="page"]')
      revealMenuItem(container, selected?.getClientRects().length ? selected : button)
    })
  }, [mobile])
  useEffect(() => () => cancelAnimationFrame(toggleFrame.current ?? 0), [])
  useEffect(() => {
    if (!visible || !menu.current) return
    const nav = menu.current
    const container = mobile ? nav.closest<HTMLElement>('.dialog-body') : nav
    if (!container) return
    const mode = collapsed ? 'collapsed' : 'expanded'
    const remember = () => { positions.current[mode] = container.scrollTop }
    let observer: MutationObserver | undefined
    const selector = collapsed ? '[aria-current="page"], [data-current-menu="true"]' : '[aria-current="page"]'
    const reveal = () => {
      const current = nav.querySelector<HTMLElement>(selector)
      if (!current?.getClientRects().length) return false
      revealMenuItem(container, current)
      remember()
      return true
    }
    // A permitted menu can arrive after the workspace request. Wait only for
    // this route's first target, not for subsequent accordion/re-render changes.
    const stopWaiting = () => observer?.disconnect()
    const frame = requestAnimationFrame(() => {
      container.scrollTop = positions.current[mode]
      if (!reveal()) {
        observer = new MutationObserver(() => { if (reveal()) stopWaiting() })
        observer.observe(nav, { childList: true, subtree: true })
      }
      remember()
      container.addEventListener('scroll', remember, { passive: true })
    })
    container.addEventListener('wheel', stopWaiting, { passive: true })
    container.addEventListener('pointerdown', stopWaiting, { passive: true })
    return () => {
      cancelAnimationFrame(frame); stopWaiting()
      container.removeEventListener('scroll', remember)
      container.removeEventListener('wheel', stopWaiting)
      container.removeEventListener('pointerdown', stopWaiting)
    }
  }, [path, visible, mobile, collapsed])
  return [menu, revealToggle] as const
}
