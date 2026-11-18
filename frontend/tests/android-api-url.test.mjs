import test from 'node:test'
import assert from 'node:assert/strict'
import { androidApiUrl } from '../src/android-api-url.ts'

const origin = 'https://localhost', api = 'http://localhost:5080'
test('Android USB mapping preserves WMS paths and queries without changing assets or other origins', () => {
  assert.equal(androidApiUrl('/api/auth/csrf', origin, api), api + '/api/auth/csrf')
  assert.equal(androidApiUrl('/api/tenants/example/company/logo?v=2', origin, api), api + '/api/tenants/example/company/logo?v=2')
  assert.equal(androidApiUrl('/assets/app.js', origin, api), origin + '/assets/app.js')
  assert.equal(androidApiUrl('https://other.example/api/items', origin, api), 'https://other.example/api/items')
  assert.equal(androidApiUrl('/api/auth/me', origin, 'https://test.example'), 'https://test.example/api/auth/me')
})
test('Reject credential-bearing and insecure non-loopback Android API origins', () => {
  for (const invalid of ['http://192.168.0.5:5080', 'https://user:secret@test.example', 'https://test.example/api', 'https://test.example?token=secret', 'https://test.example#token']) {
    assert.throws(() => androidApiUrl('/api/auth/login', origin, invalid))
  }
})
