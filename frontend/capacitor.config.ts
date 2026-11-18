import type { CapacitorConfig } from '@capacitor/cli'
import { iosApiBaseUrl } from './src/ios-api-url'

const platform = process.argv.slice(2).find(value => value === 'ios' || value === 'android') || process.env.CAPACITOR_PLATFORM
const ios = platform === 'ios'

// Android keeps its USB-only localhost API. iOS uses an explicit, separately validated origin.
const config: CapacitorConfig = {
  appId: 'com.ieble.wms.test',
  appName: ios ? 'IEBLE WMS' : '아이블 WMS',
  webDir: ios ? 'dist-ios' : 'dist',
  loggingBehavior: 'none',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ...(ios ? { ios: { contentInset: 'never' as const, scrollEnabled: true, backgroundColor: '#FFFFFF' } } : {}),
  plugins: {
    CapacitorHttp: { enabled: true },
    SystemBars: { insetsHandling: 'native' },
    WmsApi: { baseUrl: ios ? iosApiBaseUrl(process.env.WMS_IOS_API_URL || 'http://localhost:5080', {
      device: process.env.WMS_IOS_TARGET === 'device', release: process.env.WMS_IOS_RELEASE === '1',
    }) : 'http://localhost:5080' },
  },
}
export default config
