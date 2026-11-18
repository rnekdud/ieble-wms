import { useBarcodeCamera } from '../../use-barcode-camera'
import { useMobile } from '../../use-mobile'
import OrganizationDialog from './OrganizationDialog'
import CameraFocusControl from '../mobile/CameraFocusControl'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { barcodeError } from '../../rack-barcode'
import { scanEvent } from '../../barcode-scan'
import type { BarcodeScanEvent } from '../../barcode-scan'
import './receipt-scan.css'

export default function BarcodeScanInput({ onScan, disabled = false, label = '작업 바코드', inputRef, showHelp = true, autoFocus = true, scanLabel = '스캔 처리', actions }: {
  actions?: ReactNode; showHelp?: boolean; autoFocus?: boolean; scanLabel?: string; onScan: (event: BarcodeScanEvent) => boolean; disabled?: boolean; label?: string; inputRef?: RefObject<HTMLInputElement | null>
}) {
  const ownInput = useRef<HTMLInputElement>(null), input = inputRef || ownInput
  const buffer = useRef(''), [text, setText] = useState(''), [error, setError] = useState('')
  const mobile = useMobile()
  const camera = useBarcodeCamera(code => { accept(code) }, disabled)
  function accept(barcode: string) {
    const problem = barcodeError(barcode)
    if (problem) { setError(problem); return false }
    setError('')
    return onScan(scanEvent(barcode))
  }
  function scan() {
    if (disabled || !buffer.current) return
    if (accept(buffer.current)) { buffer.current = ''; setText('') }
    input.current?.focus({ preventScroll: true })
  }
  useEffect(() => { if (autoFocus && !window.matchMedia('(max-width:1024px)').matches) input.current?.focus() }, [input, autoFocus])
  return <div className="barcode-input">
    <div className="barcode-input-row"><label>{label}<input ref={input} aria-label={label} placeholder="스캔하거나 입력한 뒤 Enter" value={text} maxLength={64} disabled={disabled} autoComplete="off" spellCheck={false} onChange={e => { buffer.current = e.target.value; setText(e.target.value) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab' && buffer.current) { e.preventDefault(); e.stopPropagation(); scan() } }} /></label><button type="button" className="primary" disabled={disabled} onClick={scan}>{scanLabel}</button><button type="button" className="secondary" disabled={disabled || camera.open} onClick={() => void camera.start()}>카메라 스캔</button>{actions}</div>
    {showHelp && <p>USB·Bluetooth 스캐너 또는 직접 입력 · Enter/Tab으로 처리 · 카메라는 한 번에 1개씩 인식</p>}
    {camera.open && !disabled && <OrganizationDialog className="mobile-camera-dialog" title="바코드 스캔" headingActions={<CameraFocusControl available={camera.focusAvailable} busy={camera.refocusing} onFocus={camera.refocus} />} onClose={camera.close} actions={<><button type="button" className="secondary" onClick={() => { camera.close(); requestAnimationFrame(() => input.current?.focus()) }}>직접 입력하기</button>{!mobile && <button type="button" className="secondary" onClick={camera.close}>카메라 종료</button>}</>}><div className="mobile-camera-preview"><video ref={camera.video} muted playsInline controls={false} disablePictureInPicture disableRemotePlayback aria-label="바코드 카메라" /><span className="mobile-scan-frame" aria-hidden="true" /></div><p role="status">{camera.message}</p></OrganizationDialog>}
    {(error || camera.error) && <p className="alert error" role="alert">{error || camera.error}</p>}
  </div>
}
