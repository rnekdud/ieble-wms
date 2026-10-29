import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readRememberedEmail,
  saveRememberedEmail,
  clearRememberedEmail,
} from '../src/remembered-email.ts'
function memoryStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}
test('default is unchecked and email is blank', () =>
  assert.deepEqual(readRememberedEmail(memoryStorage()), {
    email: '',
    remember: false,
  }))
test('remembered login stores only trimmed email and preference, and restores on revisit', () => {
  const storage = memoryStorage()
  saveRememberedEmail(' user@example.test ', true, storage)
  assert.deepEqual([...storage.data.keys()].sort(), [
    'ieble.rememberEmail',
    'ieble.savedEmail',
  ])
  assert.deepEqual(readRememberedEmail(storage), {
    email: 'user@example.test',
    remember: true,
  })
})
test('unchecking clears saved email without removing other app data', () => {
  const storage = memoryStorage()
  storage.setItem('other-app', 'untouched')
  saveRememberedEmail('user@example.test', true, storage)
  clearRememberedEmail(storage)
  assert.deepEqual(readRememberedEmail(storage), { email: '', remember: false })
  assert.equal(storage.data.get('other-app'), 'untouched')
  saveRememberedEmail('user@example.test', false, storage)
  assert.equal(storage.data.has('ieble.savedEmail'), false)
})
test('blocked browser storage does not break authentication', () => {
  const storage = {
    getItem() {
      throw Error('blocked')
    },
    setItem() {
      throw Error('blocked')
    },
    removeItem() {
      throw Error('blocked')
    },
  }
  assert.deepEqual(readRememberedEmail(storage), { email: '', remember: false })
  assert.doesNotThrow(() =>
    saveRememberedEmail('user@example.test', true, storage),
  )
  assert.doesNotThrow(() => clearRememberedEmail(storage))
})

test('remembered login also preserves a staff login ID without storing a password', () => {
  const storage = memoryStorage()
  saveRememberedEmail(' staff_login_01 ', true, storage)
  assert.deepEqual(readRememberedEmail(storage), { email: 'staff_login_01', remember: true })
  assert.deepEqual([...storage.data.keys()].sort(), ['ieble.rememberEmail', 'ieble.savedEmail'])
})
