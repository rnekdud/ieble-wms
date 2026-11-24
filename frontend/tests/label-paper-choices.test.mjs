import assert from 'node:assert/strict'
import {test} from 'node:test'
import {paperChoice,paperChoicePage,savedPaper} from '../src/label-editor/paper-choices.ts'
test('combined choices retain every server-paged paper without fetching the entire list',async()=>{
 const fixed=Array.from({length:5},(_,i)=>paperChoice('fixed'+i,'Fixed '+i)),rows=Array.from({length:45},(_,i)=>({id:String(i),name:'사용자 '+i})),all=[]
 for(let page=1;page<=3;page++){
  const calls=[];const result=await paperChoicePage(fixed,page,async n=>{calls.push(n);return {items:rows.slice((n-1)*20,n*20),total:45,page:n,pageSize:20}})
  assert.equal(result.total,50);assert(calls.length<=2);all.push(...result.items.map(x=>x.id))
 }
 assert.deepEqual(all,[...fixed.map(x=>x.id),...rows.map(x=>'saved:'+x.id)])
 const result=await paperChoicePage([],1,async()=>({items:rows.slice(44),total:1,page:1,pageSize:20}));assert.deepEqual(result.items.map(x=>x.id),['saved:44'])
})
test('saved paper selection preserves physical configuration and user-defined name',()=>{
 const paper={id:'custom',name:'old',width:210,height:297,labelWidth:99.1,labelHeight:33.9,rows:8,columns:2,marginTop:12.9,marginLeft:5.9,gapX:0,gapY:0}
 const result=savedPaper({id:'one',name:'사용자 용지',document:{paper}})
 assert.deepEqual(result,{...paper,id:'saved:one',name:'사용자 용지'});assert.equal(paper.name,'old')
})
