import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Bound to the initially selected phone. Never change a different device or clear app data.
export function restoreReverse(run, ports) {
  const state = run(['get-state'])
  if (state.status !== 0 || state.stdout.trim() !== 'device') return { connected: false, restored: [] }
  const rules = run(['reverse', '--list'])
  if (rules.status !== 0) return { connected: true, restored: [], failed: true }
  const restored = []
  for (const port of ports) {
    const endpoint = `tcp:${port}`
    const exists = rules.stdout.split('\n').some(line => {
      const parts = line.trim().split(/\s+/)
      return parts.at(-2) === endpoint && parts.at(-1) === endpoint
    })
    if (!exists) {
      if (run(['reverse', endpoint, endpoint]).status !== 0) return { connected: true, restored, failed: true }
      restored.push(port)
    }
  }
  return { connected: true, restored }
}

async function recoverErrorPage(run) {
  // Only reload a failed WMS page, never navigate an already working screen.
  const health = await fetch('http://localhost:5174/', { signal: AbortSignal.timeout(2000) })
  if (!health.ok) return false
  const pid = run(['shell', 'pidof', 'com.ieble.wms.test']).stdout.trim()
  if (!/^\d+$/.test(pid)) return false
  const forward = run(['forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`])
  const port = forward.stdout.trim()
  if (forward.status !== 0 || !/^\d+$/.test(port)) return false
  let browser
  try {
    const endpoint = `http://localhost:${port}`
    const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
    if (!targets.some(target => target.type === 'page' && target.url.startsWith('http://localhost:5174/'))) return false
    const { chromium } = await import('playwright')
    browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 })
    for (const page of browser.contexts().flatMap(context => context.pages())) {
      if (page.url().startsWith('chrome-error://')) {
        await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 10000 })
        console.log('WMS 연결 오류 화면 복구 완료')
      }
    }
    return true
  } finally {
    if (browser) await browser.close()
    run(['forward', '--remove', `tcp:${port}`])
  }
}

export async function watchAndroid({ adb, serial, live }) {
  const run = args => spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 4000 })
  let connected = true
  let recoveryPending = live
  console.log('USB 연결 자동 복구 감시 중. 종료: Ctrl+C (개발 서버와 앱 데이터는 유지됩니다).')
  for (;;) {
    const result = restoreReverse(run, live ? [5174, 5080] : [5080])
    if (!result.connected && connected) console.log('USB 연결 끊김: 같은 기기의 재연결을 기다립니다.')
    connected = result.connected
    if (result.restored.length) {
      console.log(`USB 포트 연결 복구: ${result.restored.join(', ')}`)
      recoveryPending = live
    }
    if (connected && !result.failed && recoveryPending) {
      try { recoveryPending = !await recoverErrorPage(run) } catch { /* Retry after reconnect, unlock, or server recovery. */ }
    }
    await delay(3000)
  }
}
