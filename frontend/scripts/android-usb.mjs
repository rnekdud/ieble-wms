import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

const frontend = resolve(import.meta.dirname, '..')
const live = process.argv.includes('--live'), install = process.argv.includes('--install'), launch = process.argv.includes('--launch')
const adb = process.env.ADB || [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Library/Android/sdk'), '/private/tmp/ieble-android-tools/sdk'].filter(Boolean).map(sdk => join(sdk, 'platform-tools/adb')).find(existsSync) || 'adb'
function run(args, capture = false) {
  const result = spawnSync(adb, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.error || result.status !== 0) { console.error(result.error?.message || result.stderr || 'ADB 작업 실패'); process.exit(result.status || 1) }
  return result.stdout || ''
}
const devices = run(['devices'], true).split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[1] === 'device').map(parts => parts[0])
const serial = process.env.ANDROID_SERIAL || (devices.length === 1 ? devices[0] : '')
if (!serial || !devices.includes(serial)) {
  console.error('USB 디버깅을 허용한 Android 기기 1대를 연결하세요. 여러 기기는 ANDROID_SERIAL로 지정하세요.'); process.exit(1)
}
const args = ['-s', serial]
for (const port of live ? [5174, 5080] : [5080]) run([...args, 'reverse', `tcp:${port}`, `tcp:${port}`])
run([...args, 'reverse', '--list'])
if (install) {
  const variant = live ? 'liveReload' : 'debug'
  const apk = join(frontend, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`)
  if (!existsSync(apk)) { console.error(`APK가 없습니다. 먼저 npm run android:apk${live ? ':live' : ''}를 실행하세요.`); process.exit(1) }
  // Replace the same package with the same debug key; never uninstall or clear app data.
  run([...args, 'install', '-r', apk])
}
if (launch) run([...args, 'shell', 'am', 'start', '-n', 'com.ieble.wms.test/.MainActivity'])
console.log(live ? 'Live Reload USB 연결 준비 완료: http://localhost:5174, /api → 5080. USB 재연결 후 npm run android:live.' : 'USB API 연결 준비 완료: 휴대폰 localhost:5080 → 맥북 localhost:5080.')
if (process.argv.includes('--watch')) {
  const { watchAndroid } = await import('./android-live-watch.mjs')
  await watchAndroid({ adb, serial, live })
}
