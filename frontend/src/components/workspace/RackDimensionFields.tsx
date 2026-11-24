import { useLanguage } from '../../use-language'
import { t as uiText } from '../../i18n.ts'
import ReadOnlyInput from '../ReadOnlyInput'
import FormLabel from '../FormLabel'
import {useId,useLayoutEffect,useRef,useState} from 'react'
import {rackDimensionChange} from '../../rack-dimensions'
import type {RackDimensions,RackDimensionKey} from '../../rack-dimensions'
type Props={value:RackDimensions;onChange:(patch:Partial<Pick<RackDimensions,RackDimensionKey>>)=>void;prefix?:string;disabled?:boolean;showTotal?:boolean}
export default function RackDimensionFields({value,onChange,prefix='랙',disabled=false,showTotal=false}:Props){
 return <>{(['levels','bays'] as const).map(dimension=><DimensionInput key={dimension} dimension={dimension} value={value} onChange={onChange} prefix={prefix} disabled={disabled}/>)}{showTotal && <label>{uiText("총 보관 위치")}<ReadOnlyInput aria-label={uiText("{v0} 총 보관 위치", { v0: prefix })} className="rack-total-readonly" readOnly value={uiText("{v0}개", {v0:value.levels*value.bays})}/></label>}</>
}
function DimensionInput({dimension,value,onChange,prefix,disabled}:Props&{dimension:RackDimensionKey}){
 const language=useLanguage()
 const input=useRef<HTMLInputElement>(null),errorId=useId()
 // Only rejected text is buffered locally; both editors share the committed rack draft.
 const [rejected,setRejected]=useState<{text:string;source:string;error:string}|null>(null)
 const source=`${value.levels}:${value.bays}`,pending=rejected?.source===source?rejected:null
 if(rejected&&rejected.source!==source)setRejected(null)
 const error=pending?.error||'',title=dimension==='levels'?'단수':'칸수'
 useLayoutEffect(()=>{input.current?.setCustomValidity(uiText(error))},[error,language])
 return <label><FormLabel required>{uiText(title)}</FormLabel><input ref={input} type="number" required min={Math.max(1,(dimension==='levels'?value.minimumLevels:value.minimumBays)||1)} max={100} step={1} disabled={disabled} aria-label={`${uiText(prefix || '')} ${uiText(title)}`} aria-invalid={!!error} aria-describedby={error?errorId:undefined} value={pending?.text??(value[dimension]||'')} placeholder={value[dimension] ? undefined : uiText("직접 확인")} onChange={e=>{const result=rackDimensionChange(value,dimension,e.target.value);if(result.error)setRejected({text:e.target.value,source,error:result.error});else{setRejected(null);onChange(result.patch!)}}}/>{error && <small id={errorId} className="warehouse-field-error" role="alert">{uiText(error)}</small>}</label>
}
