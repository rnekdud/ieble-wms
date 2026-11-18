import { spawnSync } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { iosApiBaseUrl } from '../src/ios-api-url.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const action = process.argv[2] || 'sync'
if (!['sync', 'build', 'run'].includes(action)) throw new Error('사용법: npm run ios:sync 또는 ios:simulator:build / ios:simulator:run')
const env = { ...process.env, CAPACITOR_PLATFORM: 'ios' }
const baseUrl = iosApiBaseUrl(env.WMS_IOS_API_URL || 'http://localhost:5080', {
  device: env.WMS_IOS_TARGET === 'device', release: env.WMS_IOS_RELEASE === '1',
})
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error(`${command} 실패: ${result.error?.message || result.stderr || result.status}`)
  return result.stdout
}
// Xcode builds do not install on real devices or create/change signing identities.
if (action !== 'sync') {
  const version = run('xcodebuild', ['-version'], true)
  if (Number(version.match(/Xcode (\d+)/)?.[1] || 0) < 26) throw new Error('Capacitor 8에는 Xcode 26 이상이 필요합니다.')
  run('xcrun', ['simctl', 'list', 'devices', 'available'], true)
}
run('npm', ['run', 'build:ios'])
run('npx', ['cap', 'sync', 'ios'])
// Release has no HTTP ATS exception. Debug grants only the explicitly selected
// development host, never arbitrary loads or all web content.
await copyFile(new URL('../ios/App/App/Info.plist', import.meta.url), new URL('../ios/App/App/Info-Debug.plist', import.meta.url))
if (baseUrl.startsWith('http:')) {
  const domain = new URL(baseUrl).hostname
  const ats = { NSExceptionDomains: { [domain]: { NSExceptionAllowsInsecureHTTPLoads: true } } }
  run('plutil', ['-insert', 'NSAppTransportSecurity', '-json', JSON.stringify(ats), 'ios/App/App/Info-Debug.plist'])
}
if (action !== 'sync') {
  run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', 'ios/DerivedData', 'CODE_SIGNING_ALLOWED=NO', 'build'])
  if (action === 'run') {
    const devices = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], true))
    const booted = Object.values(devices.devices).flat().filter(device => device.state === 'Booted')
    const udid = env.WMS_IOS_SIMULATOR_UDID || (booted.length === 1 ? booted[0].udid : '')
    if (!udid) throw new Error('Xcode에서 Simulator를 하나 실행하거나 WMS_IOS_SIMULATOR_UDID를 지정해 주세요.')
    run('xcrun', ['simctl', 'install', udid, 'ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app'])
    run('xcrun', ['simctl', 'launch', udid, 'com.ieble.wms.test'])
  }
}
console.log('iOS 웹 동기화 완료. Xcode: frontend/ios/App/App.xcodeproj')
