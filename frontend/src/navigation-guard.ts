export type NavigationAttempt = { proceed: () => void; cancel: () => void }
export type NavigationRequest = CustomEvent<NavigationAttempt>
let resuming = 0

// One decision per destination. A resumed callback may itself call the router.
export function requestNavigation(proceed: () => void, cancel = () => {}): boolean {
  let settled = false
  const attempt: NavigationAttempt = {
    proceed() {
      if (settled) return
      settled = true
      resuming++
      try { proceed() } finally { resuming-- }
    },
    cancel() { if (!settled) { settled = true; cancel() } },
  }
  if (resuming) { attempt.proceed(); return true }
  const allowed = window.dispatchEvent(new CustomEvent('wms-before-navigate', { cancelable: true, detail: attempt }))
  if (allowed) attempt.proceed()
  return allowed
}

export function registerUnsavedNavigation(onBlocked: (attempt: NavigationAttempt) => void, busy = false, onDiscard = () => {}) {
  let pending: NavigationAttempt | null = null, released = false
  const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
  const navigate = (event: Event) => {
    if (released) return
    event.preventDefault()
    const attempt = (event as NavigationRequest).detail
    // Preserve the first intended destination while its modal is open.
    if (busy || pending) { attempt.cancel(); return }
    pending = attempt
    onBlocked(attempt)
  }
  window.addEventListener('beforeunload', unload)
  window.addEventListener('wms-before-navigate', navigate)
  function release() {
    released = true
    window.removeEventListener('beforeunload', unload)
    window.removeEventListener('wms-before-navigate', navigate)
  }
  return {
    stay() { const attempt = pending; pending = null; attempt?.cancel() },
    discard() {
      const attempt = pending; pending = null
      if (!attempt) return
      // Detach both blockers before resuming, including asynchronous history traversal.
      release()
      onDiscard()
      attempt.proceed()
    },
    dispose() { release(); const attempt = pending; pending = null; attempt?.cancel() },
  }
}

// Compare editable values, not object key order, undo stacks or selection state.
export function editSnapshot(value: unknown): string {
  return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}
