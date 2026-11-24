import { useLayoutEffect, useRef } from 'react'

/** Fit the desktop workspace between the existing WMS header and footer. */
export function useWorkspaceHeight() {
  const root = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const node = root.current!
    const update = () => {
      const workspace = node.querySelector<HTMLElement>('.label-workspace')
      if (!workspace) return
      const content = node.closest('.wms-content'), footer = node.closest('.wms-layout')?.querySelector('.wms-footer')
      const bottom = content ? parseFloat(getComputedStyle(content).paddingBottom) : 16
      const footerHeight = footer?.getBoundingClientRect().height ?? 0
      const top = workspace.getBoundingClientRect().top + window.scrollY
      const height = Math.max(360, Math.floor(window.innerHeight - top - bottom - footerHeight - 4))
      node.style.setProperty('--label-workspace-height', `${height}px`)
    }
    // Observe now, write next frame: changing the workspace height also resizes this root.
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    update()
    const observer = new ResizeObserver(schedule)
    observer.observe(node)
    window.addEventListener('resize', schedule)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule) }
  }, [])
  return root
}
