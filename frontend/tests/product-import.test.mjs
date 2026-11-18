import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/api.ts'
import { importFailure, importReview, importErrors } from '../src/product-import-model.ts'
const errors = [
  {row:8,column:'소비자가',value:'삼천원',message:'숫자로 입력해 주세요.'},
  {row:8,column:'인박스 수량',value:'-5',message:'1 이상의 정수를 입력해 주세요.'},
  {row:12,column:'상품명',value:'',message:'상품명을 입력해 주세요.'},
]
const previous={committed:false,total:2,errors:[],rows:[{row:8,name:'바나나',code:'B'},{row:12,name:'',code:'S'}]}
for(const status of [400,409,413]) test(`import preserves all errors and product context with HTTP ${status}`,()=>{
 const response=importFailure(new ApiError(status,'업로드 실패',undefined,{errors}),previous)
 assert.equal(response.message,'');assert.deepEqual(response.review.errors,errors);assert.equal(response.review.invalid,2);assert.equal(response.review.valid,0);assert.deepEqual(response.review.rows,previous.rows)
})
test('file errors are visible despite no product rows; ASP.NET validation entries are retained without exposing internals',()=>{
 const result=importFailure(new ApiError(400,'bad',undefined,{errors:{FileBase64:['internal path','trace'],RequestId:['parser error']}}))
 assert.equal(result.review.errors.length,3);assert.equal(result.review.total,0)
 assert(result.review.errors.every(e=>e.row===0&&e.message.includes('파일을 다시 선택')))
 assert(!JSON.stringify(result).includes('internal'))
 assert.equal(importErrors([{row:0,column:'파일',value:'',message:'구조 오류'}],previous).valid,0)
})
test('network and server failures remain separate from workbook errors',()=>{
 for(const status of [0,401,403,500]) assert.equal(importFailure(new ApiError(status,'연결 오류',undefined,{errors}),previous).review,null)
 assert.equal(importReview({errors:'bad'}),null)
 assert.equal(importReview({...previous,errors:[{row:8,column:'a'}]}),null)
 assert.deepEqual(importReview(previous),previous)
})
