import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceMenus, workspacePages, canViewPage, findWorkspacePage, canOpenRegistration } from '../src/components/workspace/navigation.ts'
test('workspace menu matches the agreed hierarchy and links have unique routes', () => {
  assert.deepEqual(workspaceMenus.map(menu => menu.label), ['대시보드','창고관리','상품관리','바코드 조회','입고관리','출고관리','재고관리','거래처관리','통계 및 보고서','조직관리','마스터 관리','이용 가이드','문의하기'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '재고관리').children.map(page => page.label), ['재고 이동 및 조정','재고 실사/조사'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '통계 및 보고서').children.map(page => page.label), ['재고 현황','입출고 통계','재고 변동 이력'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '조직관리').children.map(page => page.label), ['조직도','사용자 관리','항목 관리'])
  assert.deepEqual(workspaceMenus.find(menu => menu.label === '마스터 관리').children.map(page => page.label), ['기업 관리','요금제 및 결제 관리','활동 로그','권한 설정'])
  assert.equal(new Set(workspacePages.map(page => page.path)).size, workspacePages.length)
  assert.equal(findWorkspacePage('/app').key, 'dashboard')
  assert.equal(findWorkspacePage('/app/unknown'), undefined)
})
test('employee cannot see management pages but managers can', () => {
  for (const page of workspacePages) {
    assert.equal(canViewPage(page, 'Employee'), !page.managerOnly && !page.masterOnly)
    assert.equal(canViewPage(page, 'Master'), true)
    assert.equal(canViewPage(page, 'Administrator'), !page.masterOnly)
  }
})

test('registration deep links use the existing menu and require a separate create grant', () => {
  assert.equal(workspacePages.length, 21)
  for (const feature of ['products', 'receipts', 'shipments']) {
    const path = `/app/${feature}/new`
    assert.equal(findWorkspacePage(path), findWorkspacePage(`/app/${feature}`))
    assert.equal(canOpenRegistration(path, { [feature]: ['menu', 'read'] }), false)
    assert.equal(canOpenRegistration(path, { [feature]: ['menu', 'read', 'create'] }), true)
    assert.equal(canOpenRegistration(path, {}), false)
    assert.equal(findWorkspacePage(path + '/unexpected'), undefined)
  }
  assert.equal(findWorkspacePage('/app/partners/new'), undefined)
})

test('effective grants hide revoked pages, permit delegated organization pages, and protect master management', () => {
  const products = findWorkspacePage('/app/products')
  assert.equal(canViewPage(products, 'Administrator', { products: [] }), false)
  assert.equal(canViewPage(products, 'Employee', { products: ['menu'] }), false)
  assert.equal(canViewPage(products, 'Employee', { products: ['menu', 'read'] }), true)
  assert.equal(canViewPage(findWorkspacePage('/app/settings/users'), 'Employee', { users: ['menu', 'read'] }), true)
  assert.equal(canViewPage(findWorkspacePage('/app/master/permissions'), 'Administrator', { permissions: ['menu', 'read'] }), false)
  assert.equal(canViewPage(products, 'Master', {}), true)
  assert.equal(canViewPage(findWorkspacePage('/app/settings/organization'), 'Employee', {}), false)
  assert.equal(canViewPage(findWorkspacePage('/app/settings/organization'), 'Employee', { 'org-chart': ['menu', 'read'] }), true)
  assert.equal(canViewPage(findWorkspacePage('/app/settings/items'), 'Employee', { 'organization-items': ['menu', 'read'] }), true)
  assert.equal(canViewPage(findWorkspacePage('/app/settings/items'), 'Administrator', { 'organization-items': ['menu', 'read'] }), true)
})

test('product and document detail deep links inherit menu read permissions without requiring create', () => {
  for (const feature of ['products', 'receipts', 'shipments']) {
    const path = `/app/${feature}/8b17345b-9757-41c5-bcb5-e7288adc63fe`
    const page = findWorkspacePage(path)
    assert.equal(page, findWorkspacePage(`/app/${feature}`))
    assert.equal(canViewPage(page, 'Employee', { [feature]: ['menu', 'read'] }), true)
    assert.equal(canViewPage(page, 'Employee', { [feature]: ['menu'] }), false)
    assert.equal(canOpenRegistration(path, { [feature]: ['menu', 'read'] }), true)
    assert.equal(findWorkspacePage(path + '/unexpected'), undefined)
    assert.equal(findWorkspacePage(`/app/${feature}/not-an-id`), undefined)
  }
  assert.equal(workspacePages.length, 21)
})

test('barcode page reuses product OR warehouse read permissions without creating a new grant', () => {
  const page = findWorkspacePage('/app/barcode-lookup')
  assert.equal(page.key, 'barcode-lookup')
  for (const area of ['products', 'warehouses']) {
    assert.equal(canViewPage(page, 'Employee', { [area]: ['menu','read'] }), true)
    assert.equal(canViewPage(page, 'Employee', { [area]: ['menu'] }), false)
  }
  assert.equal(canViewPage(page, 'Employee', {}), false)
})

test('activity logs are visible only to the current tenant master', () => {
 const page=findWorkspacePage('/app/master/activity-log')
 assert(page)
 assert.equal(canViewPage(page, 'Master'), true)
 assert.equal(canViewPage(page, 'Administrator', { 'activity-log': ['menu','read'] }), false)
 assert.equal(canViewPage(page, 'Employee'), false)
})
