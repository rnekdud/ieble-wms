import { useState, useSyncExternalStore } from 'react'
import { subscribeInstall, installState, installMobileApp } from '../../mobile-install'
export default function MobileInstall() {
  const state = useSyncExternalStore(subscribeInstall, installState)
  const [help, setHelp] = useState(false)
  if (state === 'installed') return null
  return <div className="mobile-install"><button className="secondary" type="button" onClick={async () => { if (state !== 'available') { setHelp(v => !v); return } try { await installMobileApp() } catch { setHelp(true) } }}>홈 화면에 추가</button>{help && <p>브라우저 메뉴의 [앱 설치] 또는 [홈 화면에 추가]를 선택하세요. iPhone에서는 Safari의 공유 메뉴에서 추가할 수 있습니다. 설치와 카메라 사용에는 HTTPS 연결이 필요합니다.</p>}</div>
}
