import type { ComponentProps } from 'react'

/** Fixed values cannot receive focus. Preserve named values in native form submissions. */
export default function ReadOnlyInput({ readOnly = true, disabled, name, value, defaultValue, form, ...props }: ComponentProps<'input'>) {
  return <>
    <input {...props} form={form} name={name} value={value} defaultValue={defaultValue} readOnly={readOnly} disabled={disabled || readOnly} />
    {readOnly && !disabled && name && <input type="hidden" form={form} name={name} value={value ?? defaultValue ?? ''} />}
  </>
}
