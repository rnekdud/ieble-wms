import { useState } from 'react'
import type { ProductDraft } from '../../product-model'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'

export type BarcodePackagingDraft = Pick<ProductDraft, 'innerPackQuantity' | 'outerPackQuantity' | 'outerPackUnit' | 'palletPackQuantity'>
export type BarcodePackagingChange = (key: keyof BarcodePackagingDraft, value: string) => void
type QuantityKey = 'innerPackQuantity' | 'outerPackQuantity' | 'palletPackQuantity'
const labels = { innerPackQuantity: '인박스 수량', outerPackQuantity: '아웃박스 수량', palletPackQuantity: '파레트당 아웃박스' }
const valid = (value: string) => value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 999999999

export default function BarcodePackagingInputs({ draft, change, packageCode, index, busy }: {
  draft: BarcodePackagingDraft; change: BarcodePackagingChange; packageCode: string; index: number; busy: boolean
}) {
  // Only presentation state is local. Quantities always belong to the product draft.
  const [editing, setEditing] = useState<QuantityKey[]>([])
  const needsOuter = packageCode === 'OUTER' || packageCode === 'PALLET'
  const required: QuantityKey[] = packageCode === 'INNER' ? ['innerPackQuantity'] : needsOuter
    ? [...(draft.outerPackUnit === 'EA' ? [] : ['innerPackQuantity' as const]), 'outerPackQuantity', ...(packageCode === 'PALLET' ? ['palletPackQuantity' as const] : [])]
    : []
  const fields = required.filter(key => !valid(draft[key]) || editing.includes(key))
  if (!fields.length) return null
  return <div className="barcode-packaging-inputs" onFocusCapture={() => setEditing(fields)} onBlurCapture={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing([])
  }}>
    {fields.map(key => <label key={key}>
      <FormLabel required>{labels[key]}</FormLabel>
      <QuantityInput unit="EA" aria-label={`바코드 ${index + 1} ${labels[key]}`} required aria-required="true" aria-invalid={!valid(draft[key])} min="1" max="999999999" step="1" value={draft[key]} disabled={busy} onChange={event => change(key, event.target.value)} />
      <small>{!valid(draft[key]) ? draft[key] === '' ? `${labels[key]} 설정이 없습니다. 바코드 등록을 위해 수량을 입력해 주세요. ` : '1~999,999,999 사이의 정수를 입력해 주세요. ' : ''}{key === 'palletPackQuantity' ? '아웃박스 / 파레트' : key === 'innerPackQuantity' ? '낱개 / 인박스' : draft.outerPackUnit === 'EA' ? '낱개 / 아웃박스' : '인박스 / 아웃박스'}</small>
    </label>)}
    {needsOuter && <label>아웃박스 구성<select aria-label={`바코드 ${index + 1} 아웃박스 구성`} value={draft.outerPackUnit} disabled={busy} onChange={event => change('outerPackUnit', event.target.value)}><option value="INNER">인박스</option><option value="EA">낱개 직접 포장</option></select></label>}
  </div>
}
