import { t as uiText } from '../i18n.ts'
import './page-size-select.css'

/** Change only the current list's pagination; the owner resets its page to one. */
export default function PageSizeSelect({ value, onChange, disabled = false, label = '페이지당 표시 건수' }: {
  value: number; onChange: (size: number) => void; disabled?: boolean; label?: string
}) {
  const sizes = [...new Set([20, 50, 100, value])].sort((a, b) => a - b)
  return <div className="table-page-size"><label><span>{uiText("표시건수")}</span><select aria-label={uiText(label)} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>
    {sizes.map(size => <option key={size} value={size}>{size}{uiText("개")}</option>)}
  </select></label></div>
}
