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
