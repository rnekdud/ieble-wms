import { useEffect, useState } from 'react'

type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }

/** Own only the fullscreen/orientation session opened by this editor. */
export function useEditorLandscape(active: boolean) {
  const [session] = useState(() => {
    let wanted = false, pending = false, fullscreen = false, locked = false
    const orientation = screen.orientation as LockableOrientation | undefined
    const root = document.documentElement
    function release() {
      if (locked) { orientation?.unlock(); locked = false }
      if (fullscreen) {
        fullscreen = false
        if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {})
      }
    }
    return {
      async enter() {
        wanted = true
        if (pending || locked || !orientation?.lock) return
        pending = true
        try {
          if (!document.fullscreenElement && root.requestFullscreen) {
            try { await root.requestFullscreen(); fullscreen = true } catch { /* Installed apps may allow a lock without fullscreen. */ }
          }
          if (!wanted) return
          await orientation.lock('landscape')
          locked = true
        } catch { /* Keep editing available with a manual rotation hint. */ }
        finally { pending = false; if (!wanted) release() }
      },
      leave() { wanted = false; release() },
    }
  })
  useEffect(() => {
    if (active) void session.enter()
    else session.leave()
    return () => session.leave()
  }, [active, session])
  return session
}
