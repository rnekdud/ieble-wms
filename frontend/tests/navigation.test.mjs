import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceMenus, workspacePages, canViewPage, findWorkspacePage } from '../src/components/workspace/navigation.ts'
test('workspace menu matches the agreed hierarchy and links have unique routes', () => {
  assert.deepEqual(workspaceMenus.map(menu => menu.label), ['대시보드','창고관리','상품관리','입고관리','출고관리','재고관리','거래처관리','통계 및 보고서','문의하기','환경설정'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '재고관리').children.map(page => page.label), ['재고 이동 및 조정','재고 실사'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '통계 및 보고서').children.map(page => page.label), ['재고 현황','입출고 통계','재고 변동 이력'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '환경설정').children.map(page => page.label), ['기업 정보 관리','사용자 및 권한 관리','요금제 및 결제 관리'])
  assert.equal(new Set(workspacePages.map(page => page.path)).size, workspacePages.length)
  assert.equal(findWorkspacePage('/app').key, 'dashboard')
  assert.equal(findWorkspacePage('/app/unknown'), undefined)
})
test('employee cannot see management pages but managers can', () => {
  for (const page of workspacePages) {
    assert.equal(canViewPage(page, 'Employee'), !page.managerOnly)
    assert.equal(canViewPage(page, 'Master'), true)
    assert.equal(canViewPage(page, 'Administrator'), true)
  }
})
