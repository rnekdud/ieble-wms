import './camera-scan.css'

export default function CameraFocusControl({ available, busy, onFocus }: { available: boolean; busy: boolean; onFocus: () => Promise<void> }) {
  return <div className="camera-focus-controls"><button type="button" className="secondary" disabled={!available || busy} title={!available ? '카메라 준비 중이거나 이 카메라가 초점 재조정을 지원하지 않습니다.' : undefined} onClick={() => void onFocus()}>{busy ? '초점 맞추는 중…' : '초점 다시 맞추기'}</button></div>
}
