import { useLayoutEffect, useRef, useState } from 'react'
import { registerUnsavedNavigation } from './navigation-guard'

export function useUnsavedNavigation(active: boolean, busy = false, onDiscard?: () => void) {
  const [blocked, setBlocked] = useState(false)
  const guard = useRef<ReturnType<typeof registerUnsavedNavigation> | null>(null)
  const discardChanges = useRef(onDiscard)
  useLayoutEffect(() => { discardChanges.current = onDiscard })
  useLayoutEffect(() => {
    if (!active) return
    const current = registerUnsavedNavigation(() => setBlocked(true), busy, () => discardChanges.current?.())
    guard.current = current
    return () => { current.dispose(); if (guard.current === current) guard.current = null }
  }, [active, busy])
  return {
    blocked,
    stay() { guard.current?.stay(); setBlocked(false) },
    discard() { setBlocked(false); guard.current?.discard() },
    saved() { guard.current?.dispose(); setBlocked(false) },
  }
}
