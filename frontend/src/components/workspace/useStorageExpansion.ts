import { useState } from 'react'

export function useStorageExpansion(active: boolean, initiallyOpen = false, selectionKey?: string) {
  const [expanded, setExpanded] = useState(initiallyOpen || active)
  const token = active ? selectionKey || true : false
  const [previous, setPrevious] = useState(token)
  if (previous !== token) { setPrevious(token); if (active) setExpanded(true) }
  return [expanded, setExpanded] as const
}
