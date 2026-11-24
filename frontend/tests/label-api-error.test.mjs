import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/api.ts'
import { labelApiError } from '../src/label-editor/api-error.ts'
test('label API availability distinguishes missing route from missing template, authorization and CSRF failures',()=>{
 assert.match(labelApiError(new ApiError(404,'network',undefined,{})),/API 활성화/)
 for(const error of [new ApiError(404,'템플릿을 찾을 수 없습니다.',undefined,{message:'템플릿을 찾을 수 없습니다.'}),new ApiError(404,'인증 서비스 오류'),new ApiError(403,'권한이 없습니다.'),new ApiError(409,'다른 사용자가 수정했습니다.'),new ApiError(500,'서버 요청을 처리하지 못했습니다.')])assert.equal(labelApiError(error),error.message)
 assert.equal(labelApiError(undefined),'작업을 완료하지 못했습니다.')
})
