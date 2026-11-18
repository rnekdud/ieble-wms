import { useEffect, useState } from 'react'
import { api } from '../../api'

export function useReportRead<T>(url: string, revision = 0) {
  const key = `${url}:${revision}`, [state, setState] = useState<{ key: string; data?: T; error?: string }>()
  useEffect(() => { let live = true; const timer = setTimeout(() => { api<T>(url).then(data => { if (live) setState({ key, data }) }).catch(e => { if (live) setState({ key, error: e.message }) }) }, 180); return () => { live = false; clearTimeout(timer) } }, [url, key])
  return { data: state?.key === key ? state.data : undefined, error: state?.key === key ? state.error : undefined, loading: state?.key !== key }
}
