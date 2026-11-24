import { useCallback, useState } from 'react'
import { api } from '../api'
import { getLocale, t } from '../i18n'
import SearchableChoiceField from '../components/workspace/SearchableChoiceField'
import { papers } from './model'
import type { Paper } from './model'
import { paperChoice, paperChoicePage } from './paper-choices'
import type { PaperPage } from './paper-choices'

export default function PaperChoice({endpoint,paper,disabled,onSelect}:{endpoint:string;paper:Paper;disabled:boolean;onSelect:(id:string)=>void}) {
 const [failed,setFailed]=useState(false),locale=getLocale()
 const loadPage=useCallback(async(search:string,page:number)=>{
  const fixed=[...papers.map(p=>paperChoice(p.id,t(p.name))),paperChoice('custom',t('사용자 지정'))].filter(p=>p.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
  try{
   const result=await paperChoicePage(fixed,page,n=>api<PaperPage>(`${endpoint}?kind=paper&page=${n}&search=${encodeURIComponent(search)}`))
   setFailed(false);return result
  }catch{setFailed(true);return {items:fixed,total:fixed.length,pageSize:20}}
 },[endpoint,locale])
 return <div className="label-paper-choice"><SearchableChoiceField endpoint={endpoint} kind="label-papers" label={t('라벨 용지')} value={paper.id} current={paperChoice(paper.id,papers.some(p=>p.id===paper.id)?t(paper.name):paper.name)} required compact disabled={disabled} searchPlaceholder={t('용지 이름')} loadPage={loadPage} onChange={choice=>{if(choice)onSelect(choice.id)}}/>{failed&&<small role="alert">{t('저장된 용지를 불러오지 못했습니다. 목록을 다시 열어 재시도해 주세요.')}</small>}</div>
}
