import test from 'node:test'
import assert from 'node:assert/strict'
import {pageTitle} from '../src/page-title.ts'
test('central titles follow login, workspace navigation and direct detail/registration routes',()=>{
 for(const [path,label] of [['/login','로그인'],['/register','회원가입'],['/app','대시보드'],['/app/products','상품관리'],['/app/warehouses','창고관리'],['/app/receipts','입고관리'],['/app/shipments','출고관리'],['/app/master/permissions','권한 설정'],['/app/settings/company','기업 관리'],['/app/support','문의하기'],['/app/products/new','상품관리 · 등록'],['/app/products/00000000-0000-0000-0000-000000000001','상품관리 · 상세']])assert.equal(pageTitle(path),'아이블 WMS · '+label)
 assert.equal(pageTitle('/app',true),'아이블 WMS · 비밀번호 변경')
})
