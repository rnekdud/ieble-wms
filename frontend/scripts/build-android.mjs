import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

const live = process.argv.includes('--live')
const variant = live ? 'liveReload' : 'debug'
const frontend = resolve(import.meta.dirname, '..')
const localTools = '/private/tmp/ieble-android-tools'
const candidates = [process.env.JAVA_HOME, ...(existsSync(join(localTools, 'java')) ? readdirSync(join(localTools, 'java')).map(name => join(localTools, 'java', name, 'Contents/Home')) : []), '/Applications/Android Studio.app/Contents/jbr/Contents/Home'].filter(Boolean)
const java = candidates.find(candidate => {
  const version = spawnSync(join(candidate, 'bin/java'), ['-version'], { encoding: 'utf8' }).stderr || ''
  const major = Number(version.match(/version "(\d+)/)?.[1]); return major >= 21 && major <= 24
})
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Library/Android/sdk'), join(localTools, 'sdk')].find(path => path && existsSync(join(path, 'platforms/android-36')))
if (!java || !sdk) { console.error('JDK 21~24 및 Android SDK API 36이 필요합니다. JAVA_HOME과 ANDROID_HOME을 지정해 주세요.'); process.exit(1) }
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk }
if (sdk.startsWith(localTools)) Object.assign(env, { GRADLE_USER_HOME: join(localTools, 'gradle'), ANDROID_USER_HOME: join(localTools, 'android-user') })
writeFileSync(join(frontend, 'android/local.properties'), `sdk.dir=${sdk}\n`)
for (const [command, args, cwd] of [['npm', ['run', 'android:sync'], frontend], ['./gradlew', [live ? 'assembleLiveReload' : 'assembleDebug', '--no-daemon', '--console=plain'], join(frontend, 'android')]]) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1)
}
console.log('APK:', join(frontend, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`))
