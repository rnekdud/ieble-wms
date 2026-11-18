export default function PlanColorField({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  return <label className="plan-color-field">색상<span className="plan-color-control"><input type="color" aria-label="객체 색상" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/><span aria-hidden="true">{value.toUpperCase()}</span></span></label>
}
