import { useSyncExternalStore } from 'react'
const query = '(max-width: 1024px)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
/** Presentation only: permissions, mutations and authentication remain shared. */
export function useMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
