import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanEvent, cameraError } from '../src/barcode-scan.ts'
import { restoreShipmentScans } from '../src/shipment-scan.ts'

test('deliberate repeated HID scans keep barcode and create distinct request IDs', () => {
  const first = scanEvent('CANDY-A'), second = scanEvent('CANDY-A')
  assert.equal(first.barcode, second.barcode)
  assert.notEqual(first.requestId, second.requestId)
})
test('retry recovery preserves exact ID and selected location/allocation', () => {
  const command = { ...scanEvent('CANDY-B'), allocationId: crypto.randomUUID(), locationId: crypto.randomUUID() }
  assert.deepEqual(restoreShipmentScans(JSON.stringify([command])), [command])
  assert.deepEqual(restoreShipmentScans('broken'), [])
  assert.deepEqual(restoreShipmentScans(JSON.stringify([{ ...command, locationId: 'bad-id' }])), [])
  assert.deepEqual(restoreShipmentScans(JSON.stringify(Array(101).fill(command))), [])
})
test('camera permission and missing device errors keep manual fallback available', () => {
  assert.match(cameraError(new DOMException('', 'NotAllowedError')), /권한.*직접 입력/)
  assert.match(cameraError(new DOMException('', 'NotFoundError')), /카메라가 없습니다.*직접 입력/)
  assert.match(cameraError(new DOMException('', 'NotReadableError')), /다른 앱.*직접 입력/)
})
test('HID fallback creates UUIDs when insecure-context randomUUID is unavailable', () => {
  const original = crypto.randomUUID
  try {
    crypto.randomUUID = undefined
    const first = scanEvent('CANDY'), second = scanEvent('CANDY')
    assert.match(first.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.notEqual(first.requestId, second.requestId)
  } finally { crypto.randomUUID = original }
})
