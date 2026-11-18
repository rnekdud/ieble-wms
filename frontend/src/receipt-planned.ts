import type { ReceiptProductGroup } from './receipt-groups'
/** Keep every legacy source ID while editing one product row. Never combine its physical records. */
export function resizePlannedGroup(group: ReceiptProductGroup, total: number): ReceiptProductGroup {
  const minimum=group.unit==='EA'?1000:1
  let delta=Math.round((total-group.expectedQuantity)*1000)
  const lines=group.lines.map(l=>({...l,inspectedQuantity:l.expectedQuantity}))
  for(const line of [...lines].reverse()) {
    const change=delta>=0?delta:-Math.min(-delta,Math.round(line.expectedQuantity*1000)-minimum)
    line.expectedQuantity=Math.round(line.expectedQuantity*1000+change)/1000
    line.inspectedQuantity=line.expectedQuantity;delta-=change
  }
  if(delta!==0)throw new Error(`원본 입고 행 ${lines.length}개의 연결을 유지하려면 예정 수량은 ${lines.length*minimum/1000} ${group.unit} 이상이어야 합니다.`)
  return {...group,lines,expectedQuantity:total,inspectedQuantity:total}
}
