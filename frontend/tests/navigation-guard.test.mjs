import test from 'node:test'
import assert from 'node:assert/strict'
import { requestNavigation, registerUnsavedNavigation, editSnapshot } from '../src/navigation-guard.ts'
import { createBrowserNavigation } from '../src/browser-navigation.ts'

function browser(native = true) {
  const win = new EventTarget(), entries = [{ url: '/app', state: null }], queue = []; let position = 0
  Object.defineProperty(win, 'location', { get: () => new URL(entries[position].url, 'http://localhost:5173') })
  if (native) win.navigation = { get currentEntry() { return { index: position } } }
  win.history = {
    get state() { return entries[position].state },
    get length() { return entries.length },
    replaceState(state, _, url) { entries[position] = { state, url } },
    pushState(state, _, url) { entries.splice(position + 1); entries.push({ state, url }); position++ },
    go(delta) { const next = position + delta; if (next >= 0 && next < entries.length && delta !== 0) queue.push(() => { position = next; win.dispatchEvent(new Event('popstate')) }) },
  }
  globalThis.window = win
  return { win, entries, once() { queue.shift()?.() }, flush() { for (let i = 0; queue.length; i++) { assert(i < 20, 'history restoration loop'); queue.shift()() } } }
}

test('discard resumes the first intended destination once, releases unload and bypasses nested blockers', () => {
  const { win } = browser(); let modals = 0, moved = 0, canceled = 0
  const guard = registerUnsavedNavigation(() => modals++)
  assert.equal(requestNavigation(() => requestNavigation(() => moved++)), false)
  requestNavigation(() => { moved += 100 }, () => canceled++)
  assert.equal(modals, 1); assert.equal(canceled, 1)
  assert.equal(win.dispatchEvent(new Event('beforeunload', { cancelable: true })), false)
  guard.discard(); guard.discard()
  assert.equal(moved, 1)
  assert.equal(win.dispatchEvent(new Event('beforeunload', { cancelable: true })), true)
  requestNavigation(() => moved++); assert.equal(moved, 2)
  guard.dispose()
})
test('continue editing cancels only the transition, retains the blocker and can confirm a later destination', () => {
  browser(); let moved = '', canceled = 0
  const guard = registerUnsavedNavigation(() => {})
  requestNavigation(() => { moved = 'old' }, () => canceled++); guard.stay()
  assert.equal(moved, ''); assert.equal(canceled, 1)
  requestNavigation(() => { moved = 'new' }); guard.discard()
  assert.equal(moved, 'new'); guard.dispose()
})
test('unmount invalidates stale callbacks and busy saves do not open a confirmation', () => {
  browser(); let attempt, moved = 0, modals = 0
  const guard = registerUnsavedNavigation(value => { attempt = value })
  requestNavigation(() => moved++); guard.dispose(); attempt.proceed(); assert.equal(moved, 0)
  const busy = registerUnsavedNavigation(() => modals++, true)
  assert.equal(requestNavigation(() => moved++), false); assert.equal(modals, 0); busy.dispose()
  assert.equal(requestNavigation(() => moved++), true); assert.equal(moved, 1)
})
for (const native of [true, false]) test(`back cancellation and confirmation preserve forward history (native positions: ${native})`, () => {
  const b = browser(native), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/products'); router.navigate('/app/warehouses')
  const guard = registerUnsavedNavigation(() => {})
  b.win.history.go(-1); b.flush(); assert.equal(b.win.location.pathname, '/app/warehouses'); assert.equal(paths.at(-1), '/app/warehouses')
  guard.stay(); assert.equal(b.entries.length, 3)
  b.win.history.go(-1); b.flush(); guard.discard(); b.flush()
  assert.equal(b.win.location.pathname, '/app/products'); assert.equal(paths.at(-1), '/app/products'); assert.equal(b.entries.length, 3)
  b.win.history.go(1); b.flush(); assert.equal(paths.at(-1), '/app/warehouses')
  router.dispose(); guard.dispose()
})
test('confirmation before the restoration popstate waits and replays the original multi-entry destination', () => {
  const b = browser(), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/products'); router.navigate('/app/warehouses')
  let modals = 0; const guard = registerUnsavedNavigation(() => modals++)
  b.win.history.go(-2); b.once(); guard.discard(); b.flush()
  assert.equal(paths.at(-1), '/app'); assert.equal(modals, 1); assert.equal(b.entries.length, 3)
  b.win.history.go(2); b.flush(); assert.equal(paths.at(-1), '/app/warehouses'); router.dispose(); guard.dispose()
})
test('forward navigation can be canceled or confirmed without losing either entry', () => {
  const b = browser(), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/warehouses'); router.navigate('/app/products'); b.win.history.go(-1); b.flush()
  const guard = registerUnsavedNavigation(() => {})
  b.win.history.go(1); b.flush(); guard.stay(); assert.equal(b.win.location.pathname, '/app/warehouses')
  b.win.history.go(1); b.flush(); guard.discard(); b.flush(); assert.equal(paths.at(-1), '/app/products')
  b.win.history.go(-1); b.flush(); assert.equal(paths.at(-1), '/app/warehouses'); router.dispose(); guard.dispose()
})
test('current menu re-enters its root after confirmation without adding history', () => {
  const b = browser(), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/warehouses'); let modals = 0, discarded = 0
  const guard = registerUnsavedNavigation(() => modals++, false, () => discarded++)
  router.navigate('/app/warehouses'); assert.equal(modals, 1); assert.equal(paths.length, 1)
  guard.stay(); assert.equal(discarded, 0); assert.equal(b.entries.length, 2)
  router.navigate('/app/warehouses'); guard.discard(); guard.discard()
  assert.equal(discarded, 1); assert.deepEqual(paths, ['/app/warehouses', '/app/warehouses']); assert.equal(b.entries.length, 2)
  router.navigate('/app/warehouses'); assert.equal(paths.length, 3); assert.equal(b.entries.length, 2)
  router.dispose(); guard.dispose()
})
test('same-menu re-entry preserves the forward stack and does not retain a blocker', () => {
  const b = browser(), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/warehouses'); router.navigate('/app/products'); b.win.history.go(-1); b.flush()
  const guard = registerUnsavedNavigation(() => {})
  router.navigate('/app/warehouses'); guard.discard(); b.flush(); assert.equal(b.entries.length, 3)
  b.win.history.go(1); b.flush(); assert.equal(paths.at(-1), '/app/products'); router.dispose(); guard.dispose()
})
test('redirects retain entry metadata and untracked native positions can resume', () => {
  const b = browser(), paths = [], router = createBrowserNavigation(path => paths.push(path), b.win)
  router.navigate('/app/warehouses'); const guard = registerUnsavedNavigation(() => {})
  router.replace('/app/master/billing'); assert(b.win.history.state.__iebleNavigation)
  b.win.history.pushState({}, '', '/app/products')
  b.win.dispatchEvent(new Event('popstate')); b.flush(); assert.equal(b.win.location.pathname, '/app/master/billing')
  guard.discard(); b.flush(); assert.equal(paths.at(-1), '/app/products'); router.dispose(); guard.dispose()
})
test('editable snapshots ignore property insertion order but detect all basic, geometry and structure values', () => {
  const original = { warehouse: { name: '창고', isActive: true }, plan: { objects: [{ id: 'visual', x: .5 }] }, racks: [{ clientId: 'rack', levels: 3, bays: 4, zoneClientId: 'zone' }], zones: [{ clientId: 'zone', code: 'A' }], floors: [{ code: 'F' }] }
  const before = editSnapshot(original)
  const reordered = { floors: original.floors, zones: original.zones, racks: original.racks, plan: original.plan, warehouse: { isActive: true, name: '창고' } }
  assert.equal(editSnapshot(reordered), before)
  for (const mutate of [d => { d.warehouse.name = '다른 창고' }, d => { d.plan.objects[0].x = .6 }, d => { d.racks[0].levels = 4 }, d => { d.racks[0].bays = 5 }, d => { d.racks[0].zoneClientId = null }, d => { d.zones[0].code = 'B' }, d => { d.floors[0].code = 'F2' }]) {
    const changed = structuredClone(original); mutate(changed); assert.notEqual(editSnapshot(changed), before); Object.assign(changed, original); assert.equal(editSnapshot(changed), before)
  }
})
