import { useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage } from './i18n.ts'
export function useLanguage() { return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'ko' as const) }
