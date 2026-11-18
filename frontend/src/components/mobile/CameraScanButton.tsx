import { useEffect } from 'react'
import { Camera } from 'lucide-react'
import { useBarcodeCamera } from '../../use-barcode-camera'
import OrganizationDialog from '../workspace/OrganizationDialog'
import CameraFocusControl from './CameraFocusControl'
export default function CameraScanButton({ onScan, disabled = false, onManual, onError }: { onScan: (code: string) => void; disabled?: boolean; onManual?: () => void; onError?: (message: string) => void }) {
  const { video, open, error, message, start, close, focusAvailable, refocusing, refocus } = useBarcodeCamera(onScan, disabled)
  useEffect(() => { onError?.(error) }, [error, onError])
  return <>
    <button type="button" className="secondary mobile-camera-button" disabled={disabled || open} onClick={() => void start()}><Camera size={19} aria-hidden="true" />카메라 스캔</button>
    {error && !onError && <p className="alert error" role="alert">{error}</p>}
    {open && !disabled && <OrganizationDialog className="mobile-camera-dialog" title="바코드 스캔" headingActions={<CameraFocusControl available={focusAvailable} busy={refocusing} onFocus={refocus} />} onClose={close} actions={<><button type="button" className="secondary" onClick={() => { close(); if (onManual) requestAnimationFrame(onManual) }}>직접 입력하기</button><button type="button" className="secondary" onClick={close}>닫기</button></>}>
      <div className="mobile-camera-preview"><video ref={video} autoPlay muted playsInline controls={false} disablePictureInPicture disableRemotePlayback aria-label="바코드 카메라" /><span className="mobile-scan-frame" aria-hidden="true" /></div><p role="status">{message}</p>
    </OrganizationDialog>}
  </>
}
