import { useEffect, useLayoutEffect, useRef } from 'react'
import { t } from '../i18n'
import type { LabelObject } from './model'
import { fontFamily } from './render'
import { pixelsPerMm } from './viewport'

export default function InlineLabelText({ object, onChange, onFinish }: { object: LabelObject; onChange: (text: string) => void; onFinish: (cancel?: boolean) => void }) {
  const input = useRef<HTMLTextAreaElement>(null), composing = useRef(false)
  useLayoutEffect(() => {
    const node = input.current!
    node.focus({ preventScroll: true }); node.setSelectionRange(node.value.length, node.value.length)
  }, [])
  useEffect(() => {
    const node = input.current!
    function outside(event: PointerEvent) {
      const target = event.target as Element
      if (composing.current || node.contains(target) || target.closest('[data-inline-action]')) return
      // This pointer ends typing; it must not also deselect or begin a canvas gesture.
      if (target.closest('.label-canvas-scroll')) event.stopPropagation()
      onFinish()
    }
    // Keyboard visibility may scroll the page, but never writes to label or pan coordinates.
    function reveal() { if (window.matchMedia('(max-width:1100px)').matches && document.activeElement === node) node.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
    document.addEventListener('pointerdown', outside, true)
    window.visualViewport?.addEventListener('resize', reveal)
    return () => { document.removeEventListener('pointerdown', outside, true); window.visualViewport?.removeEventListener('resize', reveal) }
  }, [onFinish])
  return <textarea ref={input} className="label-inline-text" aria-label={t('라벨 텍스트 직접 편집')} maxLength={4000} spellCheck={false}
    style={{ left: object.x * pixelsPerMm, top: object.y * pixelsPerMm, width: object.width * pixelsPerMm, height: object.height * pixelsPerMm,
      transform: `rotate(${object.rotation}deg)`, fontFamily: fontFamily(object.font), fontSize: object.fontSize * 96 / 72, fontWeight: object.bold ? 700 : 400, color: object.color, textAlign: object.align }}
    value={object.text} onChange={e => onChange(e.target.value)} onBlur={e => { if(e.currentTarget.value!==object.text)onChange(e.currentTarget.value); onFinish() }}
    onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !composing.current && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); onFinish(true); input.current?.closest<HTMLElement>('.label-canvas-scroll')?.focus({preventScroll:true}) } }}
    onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} />
}
