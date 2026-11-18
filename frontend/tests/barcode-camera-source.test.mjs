import test from 'node:test'
import assert from 'node:assert/strict'

let moduleId = 0
const fresh = async () => (await import(`../src/barcode-camera-source.ts?test=${moduleId++}`)).openBarcodeCamera
function fixture({ failAlternative = false, enumerateFails = false, cancelAlternative = false } = {}) {
  const requests = [], tracks = []
  let active = true
  const media = {
    async getUserMedia({ video }) {
      const id = video.deviceId?.exact || 'distant'
      requests.push(id)
      if (id === 'autofocus' && failAlternative) throw new DOMException('busy', 'NotReadableError')
      const track = { readyState: 'live', stop() { this.readyState = 'ended' }, getSettings: () => ({ deviceId: id, facingMode: 'environment' }), getCapabilities: () => ({ focusMode: id === 'autofocus' ? ['manual', 'continuous', 'single-shot'] : ['manual'] }) }
      tracks.push(track)
      if (id === 'autofocus' && cancelAlternative) active = false
      return { getVideoTracks: () => [track], getTracks: () => [track] }
    },
    async enumerateDevices() {
      if (enumerateFails) throw Error('not exposed')
      return [{ kind: 'videoinput', deviceId: 'front', label: 'camera 1, facing front' }, { kind: 'videoinput', deviceId: 'distant', label: 'camera 2, facing back' }, { kind: 'videoinput', deviceId: 'autofocus', label: 'camera 0, facing back' }]
    },
  }
  return { media, requests, tracks, current: () => active }
}
test('selects and remembers rear autofocus lens, never opens front lens, releases rejected lens', async () => {
  const open = await fresh(), f = fixture()
  let stream = await open({ facingMode: { ideal: 'environment' } }, f.current, f.media)
  assert.equal(stream.getVideoTracks()[0].getSettings().deviceId, 'autofocus')
  assert.deepEqual(f.requests, ['distant', 'autofocus'])
  assert.equal(f.tracks[0].readyState, 'ended')
  stream.getTracks().forEach(t => t.stop())
  stream = await open({}, f.current, f.media)
  assert.deepEqual(f.requests, ['distant', 'autofocus', 'autofocus'])
  stream.getTracks().forEach(t => t.stop())
})
test('closing during camera selection releases all streams', async () => {
  const open = await fresh(), f = fixture({ cancelAlternative: true })
  assert.equal(await open({}, f.current, f.media), null)
  assert(f.tracks.every(t => t.readyState === 'ended'))
})
test('unavailable alternative restores original camera; missing enumeration keeps original', async () => {
  for (const options of [{ failAlternative: true }, { enumerateFails: true }]) {
    const open = await fresh(), f = fixture(options)
    const stream = await open({}, f.current, f.media)
    assert.equal(stream.getVideoTracks()[0].getSettings().deviceId, 'distant')
    stream.getTracks().forEach(t => t.stop())
    assert(f.tracks.every(t => t.readyState === 'ended'))
  }
})
