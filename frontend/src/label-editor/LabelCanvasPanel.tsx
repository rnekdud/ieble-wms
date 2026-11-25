import { useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, PanelRight } from 'lucide-react'
import { t as uiText } from '../i18n'
import type { Design, Label } from './model'
import LabelCanvas from './LabelCanvas'
import InlineLabelText from './InlineLabelText'
import { pixelsPerMm } from './viewport'
import { useLabelPanZoom } from './useLabelPanZoom'

type Props = { editing: string | null; onEdit: (id: string) => void; onFinishEdit: (cancel?: boolean) => void; onTextChange: (text: string) => void; design: Design; index: number; selected: string[]; onSelect: (ids: string[]) => void; multiSelect: boolean; onMultiSelect: () => void; onChange: (label: Label) => void; snap: boolean; onSnap: (value: boolean) => void; showProperties: boolean; onProperties: () => void }
export default function LabelCanvasPanel({ design, index, selected, onSelect, onChange, snap, onSnap, showProperties, onProperties, editing, onEdit, onFinishEdit, onTextChange, multiSelect, onMultiSelect }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const p = design.paper
  const view = useLabelPanZoom(viewport, `${index}:${p.labelWidth}:${p.labelHeight}`, size, p.labelWidth, p.labelHeight, () => onSelect([]), !!editing)
  const { zoom, pan } = view
  useLayoutEffect(() => {
    const node = viewport.current!
    const update = () => setSize(previous => {
      if (editing) return previous
      const width = node.clientWidth, height = node.clientHeight
      return previous.width === width && previous.height === height ? previous : { width, height }
    })
    let frame = 0
    update()
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) })
    observer.observe(node)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [editing])
  const textObject = design.labels[index].objects.find(o => o.id === editing && o.kind === 'text')
  const selectedText = design.labels[index].objects.find(o => selected.length === 1 && o.id === selected[0] && o.kind === 'text')
  const options = [...new Set([.25, .5, .75, 1, 1.5, 2, 3, 4, 6, 8, ...(view.mode === 'fit' ? [] : [zoom])])].sort((a, b) => a - b)
  return <main className="label-canvas-panel">
    <div className="label-canvas-heading">
      <div className="label-canvas-identity"><strong>{uiText('라벨 {v0}', { v0: index + 1 })}</strong><span>{p.labelWidth}×{p.labelHeight}mm</span></div>
      <label className="label-check"><input type="checkbox" checked={snap} onChange={e => onSnap(e.target.checked)} />{uiText('0.5mm 스냅')}</label>
      <button className="secondary label-properties-toggle" aria-expanded={showProperties} onClick={onProperties}><PanelRight size={16} />{uiText('속성')}</button>
    </div>
    <div className="label-zoom-toolbar" role="group" aria-label={uiText('확대 도구')}>
      <button className="secondary label-fit-button" aria-label={uiText('화면 맞춤')} aria-pressed={view.mode === 'fit'} onClick={() => view.fit()}><Maximize2 size={16} /><span className="label-desktop-caption">{uiText('화면 맞춤')}</span><span className="label-mobile-caption">{uiText('맞춤')}</span></button>
      <button className="secondary" onClick={() => view.zoomTo(1)}>100%</button>
      <button className="secondary label-icon-button" aria-label={uiText('라벨 축소')} disabled={zoom <= .1} onClick={() => view.zoomTo(Math.max(.1, Math.round(zoom / 1.25 * 100) / 100))}><Minus size={16} /></button>
      <select aria-label={uiText('편집 확대')} value={view.mode === 'fit' ? 'fit' : String(zoom)} onChange={e => e.target.value === 'fit' ? view.fit() : view.zoomTo(Number(e.target.value))}>
        <option value="fit">{uiText('맞춤')} · {Math.round(zoom * 100)}%</option>
        {options.map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
      </select>
      <button className="secondary label-icon-button" aria-label={uiText('라벨 확대')} disabled={zoom >= 32} onClick={() => view.zoomTo(Math.min(32, Math.round(zoom * 1.25 * 100) / 100))}><Plus size={16} /></button>

    </div>
    <div ref={viewport} className={`label-canvas-scroll${view.className}${editing?' is-text-editing':''}`} role="region" aria-label={uiText('라벨 편집 작업 영역')} tabIndex={0} data-zoom-mode={view.mode} data-zoom={zoom} data-pan-x={pan.x} data-pan-y={pan.y} {...view.handlers}>
      <div className="label-canvas-stage" style={{ width:p.labelWidth*pixelsPerMm, height:p.labelHeight*pixelsPerMm, transform:`translate(${size.width/2-p.labelWidth*pixelsPerMm*zoom/2+pan.x}px, ${size.height/2-p.labelHeight*pixelsPerMm*zoom/2+pan.y}px) scale(${zoom})` }}><LabelCanvas key={`${p.labelWidth}:${p.labelHeight}:${index}:${view.cancelRevision}`} design={design} index={index} selected={selected} onSelect={onSelect} onChange={onChange} zoom={zoom} snap={snap} editing={editing} onEdit={onEdit} multiSelect={multiSelect} />{textObject&&<InlineLabelText object={textObject} onChange={onTextChange} onFinish={onFinishEdit}/>}</div>
    </div>
    <div className="label-canvas-actions"><button className="secondary label-multi-toggle" aria-pressed={multiSelect} onClick={onMultiSelect}>{uiText('다중 선택')}</button><div className="label-text-actions">{selectedText && (editing ? <button className="secondary" data-inline-action onPointerDown={e=>e.preventDefault()} onClick={()=>onFinishEdit()}>{uiText('편집 완료')}</button> : <button className="secondary" onClick={()=>onEdit(selectedText.id)}>{uiText('텍스트 편집')}</button>)}</div></div>
    <small><span className="label-pointer-help">{uiText('라벨 안 드래그: 영역 선택 · 바깥·Space+드래그: 이동')}</span><span className="label-touch-help">{uiText('빈 공간 드래그: 이동 · 다중 선택: 탭으로 추가')}</span><br />{uiText('확대율은 인쇄 크기에 영향을 주지 않습니다.')}</small>
  </main>
}
