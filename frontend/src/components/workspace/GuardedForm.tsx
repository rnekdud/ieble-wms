import { useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import UnsavedChangesDialog from './UnsavedChangesDialog'

// Existing organization forms use native, uncontrolled inputs. Compare their
// actual values so reverting an edit also removes the navigation warning.
export default function GuardedForm({ busy = false, children, ...props }: ComponentProps<'form'> & { busy?: boolean }) {
  const form = useRef<HTMLFormElement>(null)
  const baseline = useRef('')
  const [dirty, setDirty] = useState(false)
  const snapshot = () => {
    const values: [string, FormDataEntryValue][] = []
    new FormData(form.current!).forEach((value, key) => values.push([key, value]))
    return JSON.stringify(values)
  }
  useLayoutEffect(() => { baseline.current = snapshot() }, [])
  const guard = useUnsavedNavigation(dirty || busy, busy)
  return <>
    <form {...props} ref={form} onInput={e => { setDirty(snapshot() !== baseline.current); props.onInput?.(e) }} onChange={e => { setDirty(snapshot() !== baseline.current); props.onChange?.(e) }}>
      {children}
    </form>
    <UnsavedChangesDialog guard={guard} />
  </>
}
