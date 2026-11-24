import { t as uiText } from '../i18n'
import type { LabelObject, Paper } from './model'

type Props = { object: LabelObject; paper: Paper; image?: string; onChange: (object: LabelObject) => void; onOrder: (delta: number) => void; onDelete: () => void; onCopy: () => void; onRefresh: () => void }
export default function LabelProperties({ object: o, paper, image, onChange, onOrder, onDelete, onCopy, onRefresh }: Props) {
  const update = (patch: Partial<LabelObject>) => onChange({ ...o, ...patch })
  function size(key: 'width' | 'height', value: number) {
    if (!Number.isFinite(value) || value < .2) return
    if (o.kind === 'image') {
      const ratio = o.width / o.height
      update(key === 'width' ? { width: value, height: value / ratio } : { height: value, width: value * ratio })
    } else update({ [key]: value })
  }
  return <div className="label-properties-fields">
    <fieldset><legend>{uiText('내용 및 서식')}</legend><div className="label-property-grid">
      {(o.kind === 'text' || o.kind === 'barcode') && <label className="label-full">{uiText(o.kind === 'text' ? '텍스트' : '바코드 값')}<textarea aria-label={uiText(o.kind === 'text' ? '텍스트' : '바코드 값')} id="label-object-text" rows={3} maxLength={o.kind === 'barcode' ? 64 : 4000} value={o.text} onChange={e => update({ text: e.target.value, binding: undefined })} /></label>}
      {o.kind === 'image' && <div className="label-full label-image-properties">{image && <img src={image} alt={uiText('선택한 이미지')} />}<span>{uiText('비율 유지')}</span></div>}
      {o.binding && <div className="label-full label-binding"><small>{uiText('상품 연결 · 저장된 값 사용')}</small><button className="secondary" onClick={onRefresh}>{uiText('상품 정보 새로 불러오기')}</button><button className="secondary" onClick={() => update({ binding: undefined })}>{uiText('고정 값으로 전환')}</button></div>}
      {o.kind === 'text' && <>
        <label>{uiText('글꼴')}<select aria-label={uiText('글꼴')} value={o.font} onChange={e => update({ font: e.target.value as LabelObject['font'] })}><option value="sans-serif">{uiText('고딕')}</option><option value="serif">{uiText('명조')}</option><option value="monospace">{uiText('고정폭')}</option></select></label>
        <label>{uiText('글자 크기(pt)')}<input type="number" min={4} max={200} value={o.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })} /></label>
        <label className="label-check"><input type="checkbox" checked={o.bold} onChange={e => update({ bold: e.target.checked })} />{uiText('굵게')}</label>
        <label>{uiText('텍스트 정렬')}<select aria-label={uiText('텍스트 정렬')} value={o.align} onChange={e => update({ align: e.target.value as LabelObject['align'] })}><option value="left">{uiText('왼쪽')}</option><option value="center">{uiText('가운데')}</option><option value="right">{uiText('오른쪽')}</option></select></label>
      </>}
      {o.kind === 'barcode' && <><label>{uiText('바코드 종류')}<input value="CODE128" readOnly /></label><label className="label-check"><input type="checkbox" checked={o.showValue} onChange={e => update({ showValue: e.target.checked })} />{uiText('바코드 숫자 표시')}</label></>}
      {o.kind !== 'image' && o.kind !== 'barcode' && <label>{uiText('색상')}<input type="color" value={o.color} onChange={e => update({ color: e.target.value })} /></label>}
      {o.kind === 'rectangle' && <><label>{uiText('채우기')}<input type="color" value={o.fill === 'transparent' ? '#ffffff' : o.fill} onChange={e => update({ fill: e.target.value })} /></label><label className="label-check"><input type="checkbox" checked={o.fill === 'transparent'} onChange={e => update({ fill: e.target.checked ? 'transparent' : '#ffffff' })} />{uiText('투명')}</label></>}
      {(o.kind === 'rectangle' || o.kind === 'line') && <label>{uiText('선 굵기(mm)')}<input type="number" min={.1} max={5} step={.1} value={o.strokeWidth} onChange={e => update({ strokeWidth: Number(e.target.value) })} /></label>}
    </div></fieldset>
    <fieldset><legend>{uiText('위치 및 크기')}</legend><div className="label-property-grid">
      {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key, i) => <label key={key}>{uiText(['가로 위치(mm)', '세로 위치(mm)', '너비(mm)', '높이(mm)', '회전(°)'][i])}<input type="number" step={key === 'rotation' ? 1 : .1} value={Math.round(o[key] * 100) / 100} onChange={e => key === 'width' || key === 'height' ? size(key, Number(e.target.value)) : update({ [key]: Number(e.target.value) })} /></label>)}
    </div></fieldset>
    <fieldset><legend>{uiText('정렬 및 순서')}</legend><div className="label-button-grid">
      {(['left', 'center', 'right'] as const).map((side, i) => <button className="secondary" key={side} onClick={() => update({ x: side === 'left' ? 0 : side === 'center' ? (paper.labelWidth - o.width) / 2 : paper.labelWidth - o.width })}>{uiText(['좌측 맞춤', '가운데 맞춤', '우측 맞춤'][i])}</button>)}
      <button className="secondary" onClick={() => update({ y: (paper.labelHeight - o.height) / 2 })}>{uiText('세로 가운데')}</button><button className="secondary" onClick={() => onOrder(1)}>{uiText('앞으로')}</button><button className="secondary" onClick={() => onOrder(-1)}>{uiText('뒤로')}</button>
    </div></fieldset>
    <div className="label-button-grid label-object-actions"><button className="secondary" onClick={onCopy}>{uiText('객체 복사')}</button><button className="secondary" onClick={onDelete}>{uiText('객체 삭제')}</button></div>
  </div>
}
