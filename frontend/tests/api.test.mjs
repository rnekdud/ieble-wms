import test from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError } from '../src/api.ts'

test('mutations fetch CSRF on the same origin and forward the token with cookies', async () => {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return Response.json(
      path.endsWith('/csrf') ? { token: 'test-only-token' } : { ok: true },
    )
  }
  try {
    await api('/api/auth/login', {
      email: 'test@example.test',
      password: 'test-fixture-only',
    })
    assert.equal(calls[0].path, '/api/auth/csrf')
    assert.equal(calls[0].options.credentials, 'same-origin')
    assert.equal(calls[1].path, '/api/auth/login')
    assert.equal(calls[1].options.headers['X-CSRF-TOKEN'], 'test-only-token')
    assert.equal(calls[1].options.credentials, 'same-origin')
    assert.equal(calls[1].options.method, 'POST')
  } finally {
    globalThis.fetch = original
  }
})
for (const status of [404, 502])
  test(`CSRF HTTP ${status} preserves failure status and prevents signup POST`, async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return new Response('', { status })
    }
    try {
      await assert.rejects(
        api('/api/auth/register', {}),
        (error) =>
          error instanceof ApiError &&
          error.status === status &&
          error.message.includes('인증 서비스'),
      )
      assert.equal(calls, 1)
    } finally {
      globalThis.fetch = original
    }
  })
for (const body of [{ token: '' }, { token: null }, { status: 'ok' }])
  test(`malformed CSRF response ${JSON.stringify(body)} prevents POST`, async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return Response.json(body)
    }
    try {
      await assert.rejects(
        api('/api/auth/logout', {}),
        (error) => error instanceof ApiError && error.status === 502,
      )
      assert.equal(calls, 1)
    } finally {
      globalThis.fetch = original
    }
  })
test('unreachable CSRF endpoint prevents POST', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('fetch failed')
  }
  try {
    await assert.rejects(
      api('/api/auth/register', {}),
      (error) => error instanceof ApiError && error.status === 0,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('multipart uploads preserve files and let the browser generate the boundary while requiring CSRF', async () => {
  const original = globalThis.fetch, calls = []
  globalThis.fetch = async (path, options) => { calls.push({ path, options }); return new Response(JSON.stringify(path.endsWith('/csrf') ? { token: 'upload-token' } : { id: 'saved' }), { status: 200 }) }
  try {
    const form = new FormData(); form.set('title', '문의'); form.append('files', new Blob(['내용'], { type: 'text/plain' }), '문의.txt')
    const result = await api('/api/tenants/test/support', form)
    assert.equal(result.id, 'saved'); assert.equal(calls[1].options.body, form)
    assert.equal(calls[1].options.headers['Content-Type'], undefined)
    assert.equal(calls[1].options.headers['X-CSRF-TOKEN'], 'upload-token')
    assert.equal(calls[1].options.credentials, 'same-origin')
  } finally { globalThis.fetch = original }
})

test('only successful stock-related mutations notify the matching tenant locally and across tabs', async () => {
  const original = { fetch: globalThis.fetch, window: globalThis.window, channel: globalThis.BroadcastChannel }
  const target = new EventTarget(), events = [], messages = []
  target.addEventListener('wms:inventory-changed', e => events.push(e.detail))
  globalThis.window = target
  globalThis.BroadcastChannel = class { postMessage(value) { messages.push(value) } close() {} }
  let status = 200
  globalThis.fetch = async path => Response.json(path.endsWith('/csrf') ? { token: 'qa-csrf' } : { ok: true }, { status: path.endsWith('/csrf') ? 200 : status })
  try {
    await api('/api/tenants/company-a/inventory')
    await api('/api/tenants/company-a/support', {})
    assert.deepEqual(events, [])
    status = 409
    await assert.rejects(api('/api/tenants/company-a/shipments/doc/confirm', {}), ApiError)
    assert.deepEqual(events, [])
    status = 200
    for (const entity of ['receipts', 'shipments', 'inventory', 'stocktakes']) await api(`/api/tenants/company-a/${entity}/doc/confirm`, {})
    assert.deepEqual(events, Array(4).fill('company-a'))
    assert.deepEqual(messages, events)
    globalThis.BroadcastChannel = class { constructor() { throw Error('unsupported') } }
    assert.deepEqual(await api('/api/tenants/company-b/inventory/adjust', {}), { ok: true })
    assert.equal(events.at(-1), 'company-b')
  } finally { globalThis.fetch = original.fetch; globalThis.window = original.window; globalThis.BroadcastChannel = original.channel }
})

for (const status of [400, 409, 413]) test(`HTTP ${status} preserves structured import details`, async () => {
  const original = globalThis.fetch
  const details = { committed: false, total: 1, errors: [{ row: 8, column: '소비자가', value: '삼천원', message: '숫자로 입력해 주세요.' }], rows: [] }
  globalThis.fetch = async path => path.endsWith('/csrf') ? Response.json({ token: 'fixture' }) : Response.json(details, { status })
  try { await assert.rejects(api('/api/tenants/test/products/import-preview', {}), e => e instanceof ApiError && e.status === status && JSON.stringify(e.details) === JSON.stringify(details)) }
  finally { globalThis.fetch = original }
})
test('unexpected server details are hidden and request network failures are classified separately', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: '/private/server/stack.cs:42 internal stack trace', errors: ['internal'] }, { status: 500 })
  try {
    await assert.rejects(api('/api/test'), e => e instanceof ApiError && e.status === 500 && e.details === undefined && !e.message.includes('stack'))
    globalThis.fetch = async path => { if (path.endsWith('/csrf')) return Response.json({ token: 'fixture' }); throw new TypeError('Failed to fetch') }
    await assert.rejects(api('/api/tenants/test/products/import-preview', {}), e => e instanceof ApiError && e.status === 0 && e.message.includes('네트워크'))
  } finally { globalThis.fetch = original }
})
