import { t as uiText } from '../../i18n.ts'
import { useState } from 'react'
import { ArrowRight, BookOpen, Search, ZoomIn, ZoomOut, LogIn, Warehouse, Package, PackagePlus, Boxes, Truck, ScanLine, ArrowLeftRight, ClipboardCheck, Handshake, UsersRound, ChartNoAxesCombined, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MouseEvent } from 'react'
import { guideCategories, searchGuides, userGuides } from '../../user-guide'
import OrganizationDialog from './OrganizationDialog'
import './user-guide.css'
const guideIcons: Record<string, LucideIcon> = {
 'getting-started': LogIn, warehouses: Warehouse, products: Package, receipts: PackagePlus,
 stock: Boxes, shipments: Truck, barcode: ScanLine, 'inventory-moves': ArrowLeftRight,
 stocktakes: ClipboardCheck, partners: Handshake, organization: UsersRound,
 reports: ChartNoAxesCombined, 'settings-support': Settings2,
}
function GuideIcon({id}:{id:string}) {
 const Icon=guideIcons[id] || BookOpen
 return <Icon size={22} aria-hidden="true"/>
}
function Text({ children }: { children: string }) {
 return <>{uiText(children).split(/(\*\*[^*]+\*\*)/).map((part,i) => part.startsWith('**') ? <strong key={i}>{part.slice(2,-2)}</strong> : part)}</>
}
export default function UserGuide({path,onNavigate}:{path:string;onNavigate:(path:string)=>void}) {
 const [search,setSearch]=useState(''),[category,setCategory]=useState('전체')
 const [expanded,setExpanded]=useState<{image:string;caption:string}|null>(null),[zoom,setZoom]=useState(1)
 const id=path.split('/')[3],index=userGuides.findIndex(g=>g.id===id),article=userGuides[index]
 const navigate=(event:MouseEvent<HTMLAnchorElement>,to:string)=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();setExpanded(null);setZoom(1);onNavigate(to)}}
 const results=searchGuides(search,category)
 return <section className="user-guide" aria-label={uiText("이용 가이드")}>
  {article && <h2 className="guide-document-title">{uiText(article.title)}</h2>}
  {id&&!article ? <div className="guide-empty"><h2>{uiText("가이드를 찾을 수 없습니다.")}</h2></div> : article ? <>
   <article className="guide-article">
    <p className="guide-intro">{uiText(article.summary)}</p><p className="guide-example-note">{uiText("이미지는 예시 데이터로 촬영한 화면입니다. 메뉴와 버튼은 계정 권한·업무 상태에 따라 다를 수 있습니다.")}</p>
    <nav className="guide-contents" aria-label={uiText("문서 목차")}><strong>{uiText("이 문서에서 확인할 내용")}</strong><ol>{article.sections.map((s,i)=><li key={s.title}><a href={`#guide-section-${i+1}`} onClick={e=>{e.preventDefault();document.getElementById(`guide-section-${i+1}`)?.scrollIntoView({block:"start"})}}>{uiText(s.title)}</a></li>)}</ol></nav>
    {article.sections.map((section,i)=><section className="guide-section" id={`guide-section-${i+1}`} key={section.title}>
     <h2><span>{String(i+1).padStart(2,'0')}.</span> {uiText(section.title)}</h2>
     {section.paragraphs.map(p=><p key={p}><Text>{p}</Text></p>)}
     {section.note && <aside className="guide-note"><strong>{uiText("확인해 주세요")}</strong><p><Text>{section.note}</Text></p></aside>}
     {section.image && <figure><button type="button" className="guide-image-button" aria-label={uiText("{v0} 이미지 확대", { v0: uiText(section.caption || section.title) })} onClick={()=>{setExpanded({image:section.image!,caption:section.caption || section.title});setZoom(1)}}><img src={`/guide/${section.image}.jpg`} alt={uiText(section.caption || section.title)} loading="lazy"/><span><ZoomIn size={16}/>{uiText("크게 보기")}</span></button><figcaption>{uiText(section.caption || section.title)}</figcaption></figure>}
    </section>)}
   </article>
  </> : <>
   <p className="guide-intro">{uiText("아이블 WMS 사용 방법을 확인해 보세요.")}</p>
   <div className="guide-filters"><label className="guide-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label={uiText("가이드 검색")} placeholder={uiText("제목·기능명 검색 (예: 검수, 바코드, 피킹)")} value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="guide-categories" role="group" aria-label={uiText("가이드 카테고리")}>{guideCategories.map(c=><button type="button" key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{uiText(c)}</button>)}</div></div>
   <p className="guide-result-count" role="status">{search ? uiText("“{v0}” 검색 결과", { v0: search }) : ''}{results.length}{uiText("개의 가이드")}</p>
   {guideCategories.slice(1).map(c=>{const items=results.filter(g=>g.category===c);return items.length?<section className="guide-category" key={c}><h2>{uiText(c)}</h2><div className="guide-grid">{items.map(g=><a className="guide-card" key={g.id} href={`/app/guide/${g.id}`} onClick={e=>navigate(e,`/app/guide/${g.id}`)}><GuideIcon id={g.id}/><div><h3>{uiText(g.title)}</h3><p>{uiText(g.summary)}</p></div><ArrowRight size={18} aria-hidden="true"/></a>)}</div></section>:null})}
   {!results.length && <div className="guide-empty"><h2>{uiText("검색 결과가 없습니다.")}</h2><p>{uiText("다른 기능명으로 검색하거나 카테고리를 변경해 보세요.")}</p><button type="button" className="secondary" onClick={()=>{setSearch('');setCategory('전체')}}>{uiText("검색 초기화")}</button></div>}
  </>}
  {expanded && <OrganizationDialog title={uiText(expanded.caption)} className="guide-image-dialog" wide onClose={()=>setExpanded(null)} actions={<><button type="button" className="secondary" aria-label={uiText("이미지 축소")} disabled={zoom<=1} onClick={()=>setZoom(v=>Math.max(1,v-.5))}><ZoomOut size={17}/></button><button type="button" className="secondary" onClick={()=>setZoom(1)}>{uiText("화면 맞춤")}</button><button type="button" className="secondary" aria-label={uiText("이미지 확대")} disabled={zoom>=3} onClick={()=>setZoom(v=>Math.min(3,v+.5))}><ZoomIn size={17}/></button><button type="button" className="secondary" onClick={()=>setExpanded(null)}>{uiText("닫기")}</button></>}><div className="guide-image-scroll"><img src={`/guide/${expanded.image}.jpg`} alt={uiText(expanded.caption)} style={{width:`${zoom*100}%`}}/></div></OrganizationDialog>}
 </section>
}
