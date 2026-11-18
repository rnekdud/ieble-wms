import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreReverse } from '../scripts/android-live-watch.mjs'

test('USB reconnect restores only missing WMS ports; healthy rules are untouched', () => {
  let connected = true
  let rules = 'UsbFfs tcp:9999 tcp:9999\n'
  const writes = []
  const run = args => {
    if (args[0] === 'get-state') return { status: connected ? 0 : 1, stdout: connected ? 'device\n' : '' }
    if (args[1] === '--list') return { status: 0, stdout: rules }
    writes.push(args)
    rules += `UsbFfs ${args[1]} ${args[2]}\n`
    return { status: 0, stdout: '' }
  }
  assert.deepEqual(restoreReverse(run, [5174, 5080]).restored, [5174, 5080])
  assert.deepEqual(restoreReverse(run, [5174, 5080]).restored, [])
  connected = false
  assert.equal(restoreReverse(run, [5174, 5080]).connected, false)
  assert.equal(writes.length, 2)
  connected = true
  rules = 'UsbFfs tcp:5080 tcp:5080\n'
  assert.deepEqual(restoreReverse(run, [5174, 5080]).restored, [5174])
  assert.equal(writes.length, 3)
})

test('ADB failures do not trigger a reload-ready result', () => {
  const run = args => args[0] === 'get-state' ? { status: 0, stdout: 'device' } : { status: 1, stdout: '' }
  assert.equal(restoreReverse(run, [5174, 5080]).failed, true)
})
