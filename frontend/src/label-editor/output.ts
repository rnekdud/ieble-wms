import { nativeDocuments as documents } from '../business-documents'
import { isNativeApp } from '../native-environment'
import { printMobileLabel, printNativeLabel } from '../label-print'
import { labelSvg, printHtml, raster } from './render'
import type { Design } from './model'
export async function pdfDownload(endpoint:string,d:Design,indices:number[],name:string,test=false){
 // Rasterize the shared SVG at 300 dpi; the API positions each image in physical mm, never editor pixels.
 const labels=[];let imageBytes=0;for(const index of indices){const png=await raster(labelSvg(d,index,test),d.paper);imageBytes+=png.length;if(imageBytes>24*1024*1024)throw new Error('출력 이미지 용량이 큽니다. 페이지 범위를 나누어 출력해 주세요.');labels.push({index,png})}
 const csrf=await fetch('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'});if(!csrf.ok)throw new Error('로그인 상태를 확인해 주세요.');const {token}=await csrf.json()
 const response=await fetch(endpoint+'/pdf',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':token},body:JSON.stringify({paper:d.paper,offsetX:d.offsetX,offsetY:d.offsetY,labels})})
 if(!response.ok)throw new Error(response.status===404?'PDF 출력 API 활성화가 필요합니다.':(await response.json().catch(()=>({}))).message||'PDF 생성에 실패했습니다.')
 if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error('PDF 파일 형식을 확인해 주세요.')
 const blob=await response.blob(),fileName=[...(name||'Labels')].map(c=>c.charCodeAt(0)<32||'<>:"/\\|?*'.includes(c)?'_':c).join('')+'.pdf'
 if(isNativeApp()){const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('PDF 파일을 읽지 못했습니다.'));r.readAsDataURL(blob)});try{await documents.save({fileName,mimeType:'application/pdf',base64})}catch{throw new Error('이 앱에서 PDF 저장을 지원하지 않습니다. PC 웹에서 다운로드해 주세요.')}return}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export async function printDesign(d:Design,indices:number[],onError:()=>void,test=false){const html=printHtml(d,indices,test);if(isNativeApp()){try{await printNativeLabel({html,title:'WMS Labels',width:d.paper.width,height:d.paper.height})}catch{throw new Error('이 앱에서 인쇄를 지원하지 않습니다. PDF 다운로드 또는 PC 웹 인쇄를 사용해 주세요.')}return ()=>{}}
 return printMobileLabel(html,onError)
}
