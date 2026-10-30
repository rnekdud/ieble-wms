import { requestNavigation } from './navigation-guard.ts'

type Entry = { index: number; url: string; nativeIndex?: number }
type NavigationWindow = Window & { navigation?: { currentEntry?: { index: number } } }
const stateKey = '__iebleNavigation'

// Same-document history is restored with go(), never with pushState(): the forward stack survives.
export function createBrowserNavigation(onChange: (path: string) => void, browser: NavigationWindow = window) {
  const history = browser.history
  const url = () => browser.location.pathname + browser.location.search + browser.location.hash
  const nativeIndex = () => browser.navigation?.currentEntry?.index
  const initial = history.state?.[stateKey] as { stack: string; index: number } | undefined
  const stack = initial?.stack || crypto.randomUUID()
  let current: Entry = { index: initial?.index ?? 0, url: url(), nativeIndex: nativeIndex() }
  let restoring = false, afterRestore: (() => void) | null = null, replay: Entry | null = null, disposed = false
  function tag(entry: Entry) { history.replaceState({ ...history.state, [stateKey]: { stack, index: entry.index } }, '', entry.url) }
  tag(current)
  function accept(entry: Entry) {
    current = { ...entry, nativeIndex: nativeIndex() }
    tag(current)
    onChange(new URL(entry.url, browser.location.origin).pathname)
  }
  function ready(action: () => void) { if (restoring) afterRestore = action; else action() }
  function distance(entry: Entry) {
    const position = nativeIndex()
    return position !== undefined && entry.nativeIndex !== undefined ? entry.nativeIndex - position : entry.index - current.index
  }
  const pop = () => {
    if (disposed) return
    const state = history.state?.[stateKey] as { stack: string; index: number } | undefined
    const position = nativeIndex()
    const index = position !== undefined && current.nativeIndex !== undefined ? current.index + position - current.nativeIndex
      : state?.stack === stack ? state.index : current.index - 1
    const target: Entry = { index, url: url(), nativeIndex: position }
    if (restoring) {
      if (target.index !== current.index) {
        history.go(current.index - target.index)
        return
      }
      restoring = false
      const action = afterRestore; afterRestore = null; action?.()
      return
    }
    if (replay && replay.index === target.index && replay.url === target.url) { replay = null; accept(target); return }
    replay = null
    let immediate = true
    const allowed = requestNavigation(() => {
      if (immediate) { accept(target); return }
      ready(() => { replay = target; history.go(distance(target)) })
    })
    immediate = false
    if (!allowed) {
      restoring = true
      history.go(current.index - target.index)
    }
  }
  browser.addEventListener('popstate', pop)
  return {
    navigate(to: string) {
      const destination = new URL(to, browser.location.origin)
      const next = destination.pathname + destination.search + destination.hash
      requestNavigation(() => ready(() => {
        if (disposed) return
        // The same menu URL can contain an editor or detail view. Re-enter its root
        // after the guard without adding a duplicate browser history entry.
        if (next === current.url) { accept(current); return }
        const entry = { index: current.index + 1, url: next }
        history.pushState({ [stateKey]: { stack, index: entry.index } }, '', next)
        accept(entry)
      }))
    },
    replace(to: string) {
      // Auth/canonical-route redirects preserve the history entry's identity.
      const next = new URL(to, browser.location.origin)
      if (next.pathname === new URL(current.url, browser.location.origin).pathname) return
      current = { ...current, url: next.pathname + next.search + next.hash }
      tag(current)
    },
    dispose() { disposed = true; afterRestore = null; replay = null; browser.removeEventListener('popstate', pop) },
  }
}
