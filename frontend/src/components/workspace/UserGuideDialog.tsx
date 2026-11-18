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
 return <OrganizationDialog title="이용 가이드" className="guide-modal" wide onClose={onClose} actions={<>
  {id&&<nav className="guide-footer-nav" aria-label="가이드 문서 이동">
   <button type="button" className="secondary" onClick={()=>navigate('/app/guide')}><List size={16}/>이용 가이드 목록</button>
   {index>=0&&<>
    <button type="button" className="secondary" disabled={!previous} title={previous?.title} onClick={()=>previous&&navigate(`/app/guide/${previous.id}`)}><ArrowLeft size={16}/>이전 가이드</button>
    <button type="button" className="secondary" disabled={!next} title={next?.title} onClick={()=>next&&navigate(`/app/guide/${next.id}`)}>다음 가이드<ArrowRight size={16}/></button>
   </>}
  </nav>}
  <button type="button" className="secondary" onClick={onClose}>닫기</button>
 </>}>
  <div ref={content}><UserGuide path={path} onNavigate={navigate}/></div>
 </OrganizationDialog>
}
