import { useId, useState } from 'react'
import { statsRange } from '../../movement-stats-model'
type Range = { start: string; end: string }
export default function ReportPeriodFields({ start, end, today, preset, prefix, onPreset, onChange }: Range & { today?: string; preset?: string; prefix: string; onPreset?: (value: string) => void; onChange: (range: Range) => void }) {
 const id = useId()
 const [selection, setSelection] = useState<{ key: string; preset: string }>()
 const key = `${start}:${end}`
 const selected = preset ?? (selection?.key === key ? selection.preset : 'custom')
 function change(range: Range, value: string) { setSelection({ key: `${range.start}:${range.end}`, preset: value }); onPreset?.(value); onChange(range) }
 return <div className="report-period-fields" role="group" aria-label={`${prefix} 조회 기간`}>
  <div className="report-period-range">
   <div className="report-period-labels"><label htmlFor={`${id}-start`}>{prefix} 시작일</label><span aria-hidden="true" /><label htmlFor={`${id}-end`}>{prefix} 종료일</label></div>
   <div className="report-period-dates">
    <input id={`${id}-start`} aria-label={`${prefix} 시작일`} type="date" value={start} max={end || undefined} onChange={e=>change({start:e.target.value,end},'custom')} />
    <span aria-hidden="true">~</span>
    <input id={`${id}-end`} aria-label={`${prefix} 종료일`} type="date" value={end} min={start || undefined} onChange={e=>change({start,end:e.target.value},'custom')} />
   </div>
  </div>
  <div className="wms-segmented report-period-tabs" role="group" aria-label="조회 기간">{[['today','오늘'],['7','7일'],['30','30일'],['custom','직접 설정']].map(([value,label]) => <button type="button" key={value} aria-pressed={selected===value} onClick={() => change(value==='custom' ? {start,end} : statsRange(value,today || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date())),value)}>{label}</button>)}</div>
 </div>
}
