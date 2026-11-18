import { useCallback } from 'react'
import SearchableChoiceField from './SearchableChoiceField'

/** Search already-loaded master options without changing their IDs or fetching all server pages. */
export default function LocalChoiceField({ label, options, value, onChange, emptyLabel = '전체' }: { label:string; options:{id:string;name:string}[]; value:string; onChange:(id:string)=>void; emptyLabel?:string }) {
  const loadPage=useCallback(async(search:string,page:number)=>{
    const matches=options.filter(o=>o.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    return { items:matches.slice((page-1)*30,page*30).map(o=>({...o,code:'',unit:null,lotManaged:false,expiryManaged:false,serialManaged:false})), total:matches.length,pageSize:30 }
  },[options])
  const item=options.find(o=>o.id===value)
  return <SearchableChoiceField floating compact endpoint="" kind="local" label={label} placeholder={label} emptyOptionLabel={emptyLabel} searchPlaceholder={`${label} 검색`} value={value} current={item?{...item,code:'',unit:null,lotManaged:false,expiryManaged:false,serialManaged:false}:undefined} loadPage={loadPage} onChange={o=>onChange(o?.id||'')} />
}
