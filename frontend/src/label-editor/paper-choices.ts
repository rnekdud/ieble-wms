import type { Choice } from '../receipt-model'
import type { Paper } from './model'
import type { SavedDesign } from './LabelDialogs'
export type PaperSummary = Pick<SavedDesign,'id'|'name'>
export type PaperPage = { items:PaperSummary[];total:number;page:number;pageSize:number }
export const paperChoice = (id:string,name:string):Choice=>({id,name,code:'',unit:null,lotManaged:false,expiryManaged:false,serialManaged:false})
export const savedPaper = (saved:SavedDesign):Paper=>({...saved.document.paper,id:'saved:'+saved.id,name:saved.name})
/** Merge fixed choices with the existing server-paged paper list, reading at most two pages. */
export async function paperChoicePage(fixed:Choice[],page:number,read:(page:number)=>Promise<PaperPage>) {
 const pageSize=20,offset=(page-1)*pageSize,start=Math.max(0,offset-fixed.length),end=Math.max(0,offset+pageSize-fixed.length)
 const first=await read(Math.floor(start/pageSize)+1),pages=[first]
 if(end>first.page*first.pageSize&&first.page*first.pageSize<first.total)pages.push(await read(first.page+1))
 const items=pages.flatMap(p=>p.items.flatMap((item,i)=>{const index=(p.page-1)*p.pageSize+i;return index>=start&&index<end?[paperChoice('saved:'+item.id,item.name)]:[]}))
 return {items:[...fixed.slice(offset,offset+pageSize),...items],total:fixed.length+first.total,pageSize}
}
