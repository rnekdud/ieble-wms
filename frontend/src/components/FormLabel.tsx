import type { ReactNode } from 'react'
import './form-label.css'

/** Label text for an existing label, legend or table heading; never changes form validation. */
export default function FormLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <span className="form-label-text">{children}{required && <span className="form-required-mark" aria-hidden="true">*</span>}</span>
}
