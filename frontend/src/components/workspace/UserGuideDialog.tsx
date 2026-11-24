import { t as uiText } from '../../i18n.ts'
import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, List } from 'lucide-react'
import { userGuides } from '../../user-guide'
import OrganizationDialog from './OrganizationDialog'
import UserGuide from './UserGuide'

export default function UserGuideDialog({initialPath='/app/guide',onClose}:{initialPath?:string;onClose:()=>void}) {
 const [path,setPath]=useState(initialPath)
 const content=useRef<HTMLDivElement>(null)
 const id=path.split('/')[3],index=userGuides.findIndex(g=>g.id===id)
 const previous=userGuides[index-1],next=index>=0 ? userGuides[index+1] : undefined
 function navigate(to:string) {
  setPath(to)
  content.current?.closest('.dialog-body')?.scrollTo({top:0,behavior:'instant'})
 }
 return <OrganizationDialog title={uiText("이용 가이드")} className="guide-modal" wide onClose={onClose} actions={<>
  {id && <nav className="guide-footer-nav" aria-label={uiText("가이드 문서 이동")}>
   <button type="button" className="secondary" onClick={()=>navigate('/app/guide')}><List size={16}/>{uiText("이용 가이드 목록")}</button>
   {index>=0&&<>
    <button type="button" className="secondary" disabled={!previous} title={previous ? uiText(previous.title) : undefined} onClick={()=>previous&&navigate(`/app/guide/${previous.id}`)}><ArrowLeft size={16}/>{uiText("이전 가이드")}</button>
    <button type="button" className="secondary" disabled={!next} title={next ? uiText(next.title) : undefined} onClick={()=>next&&navigate(`/app/guide/${next.id}`)}>{uiText("다음 가이드")}<ArrowRight size={16}/></button>
   </>}
  </nav>}
  <button type="button" className="secondary" onClick={onClose}>{uiText("닫기")}</button>
 </>}>
  <div ref={content}><UserGuide path={path} onNavigate={navigate}/></div>
 </OrganizationDialog>
}
