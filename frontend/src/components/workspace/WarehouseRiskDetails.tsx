import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { conciseRiskReasons, rackHoverGroups, popoverPosition, riskNumber as num, riskStates } from '../../warehouse-risk'
import type { RiskProduct, RiskRack } from '../../warehouse-risk'
export function RiskReasons({ item, today }: { item: RiskProduct; today: string }) {
  const reasons = conciseRiskReasons(item, today)
  return reasons.length > 0 ? <ul className="risk-reason-lines">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null
}
export function RiskProductCard({ item: p, today, location = false }: { item: RiskProduct; today: string; location?: boolean }) {
  return <article className={`risk-product risk-product-compact risk-${p.status}`}>
    <RiskReasons item={p} today={today}/>
    <small>{location ? '이 위치' : '이 랙'}: 현재고 {num(p.rackQuantity)} {p.unit} · 예약 {num(p.rackReservedQuantity)} {p.unit}</small>
    {p.safetyStock != null && <small>안전재고 비교: 기업 전체 상품 기준</small>}
  </article>
}
export function RackRiskPopover({ hover, rack, code, onEnter, onLeave, onClose }: { hover: { x: number; y: number }; rack: RiskRack; code: string; onEnter: () => void; onLeave: () => void; onClose: () => void }) {
  const element = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 360, height: 400 })
  useLayoutEffect(() => { const node = element.current!; const observer = new ResizeObserver(() => setSize({ width: node.offsetWidth, height: node.offsetHeight })); observer.observe(node); return () => observer.disconnect() }, [])
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', key); window.addEventListener('resize', onClose); return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', onClose) } }, [onClose])
  const groups = rackHoverGroups(rack).filter(group => group.total > 0)
  const position = popoverPosition(hover.x, hover.y, size.width, size.height, window.innerWidth, window.innerHeight)
  return createPortal(<div ref={element} className="rack-risk-popover" role="tooltip" aria-label={`${code} 재고 위험`} style={position} onMouseEnter={onEnter} onMouseLeave={onLeave}><header><strong>{code} · 재고 상태</strong></header>
    {groups.map(group => <section key={group.status} className={`risk-hover-group risk-${group.status}`}>
      <strong>{riskStates[group.status].label} {group.total}종</strong>
      <ul>{group.products.slice(0, 3).map(p => <li key={p.productId} title={p.productName}>{p.productName}</li>)}</ul>
      {group.total > 3 && <small>외 {group.total - 3}종</small>}
    </section>)}
    {!groups.length && <p>{rack.status === 'empty' ? '보관 중인 재고 없음' : rack.status === 'safe' ? '위험·주의 상품 없음' : '확인 필요 · 랙을 클릭해 확인하세요.'}</p>}

  </div>, document.body)
}
