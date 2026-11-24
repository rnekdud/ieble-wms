// Only move the menu's own viewport, never its ancestors or the document.
export function revealMenuItem(container: HTMLElement, item: HTMLElement) {
  if (!container.clientHeight || !item.getClientRects().length) return
  const bounds = container.getBoundingClientRect(), target = item.getBoundingClientRect()
  const top = bounds.top + container.clientTop, bottom = top + container.clientHeight
  const delta = target.top < top ? target.top - top : target.bottom > bottom ? Math.min(target.bottom - bottom, target.top - top) : 0
  if (delta) container.scrollTop += delta
}
