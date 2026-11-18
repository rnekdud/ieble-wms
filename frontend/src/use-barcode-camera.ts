import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraError, cameraSupport } from './barcode-scan'
import { createCameraDecoder, type CameraDecoder } from './camera-decoder'
import { canRefocus, configureCloseFocus, refocusCamera } from './camera-close-focus'
import { openBarcodeCamera } from './barcode-camera-source'
import { isAndroidApp } from './native-environment'

export function useBarcodeCamera(onCode: (code: string) => void, disabled = false) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), decoder = useRef<CameraDecoder | null>(null)
  const generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), opening = useRef(false)
  const callback = useRef(onCode), unavailable = useRef(disabled)
  const [open, setOpen] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [focusAvailable, setFocusAvailable] = useState(false), [refocusing, setRefocusing] = useState(false)
  const focusing = useRef(false)
  useEffect(() => { callback.current = onCode; unavailable.current = disabled }, [onCode, disabled])
  const stop = useCallback(() => {
    generation.current++; opening.current = false; clearTimeout(timer.current)
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
    decoder.current?.dispose(); decoder.current = null
    if (video.current) { delete video.current.dataset.ready; video.current.srcObject = null }
  }, [])
  const close = useCallback(() => { stop(); setOpen(false); setMessage(''); setFocusAvailable(false); setRefocusing(false); focusing.current = false }, [stop])
  async function refocus() {
    const track = stream.current?.getVideoTracks()[0], token = generation.current
    if (!track || focusing.current || !canRefocus(track)) return
    focusing.current = true; setRefocusing(true)
    const applied = await refocusCamera(track)
    if (token !== generation.current) return
    focusing.current = false; setRefocusing(false)
    setMessage(applied ? '자동초점을 다시 실행했습니다. 바코드가 선명해지도록 거리를 조절해 주세요.' : '초점을 다시 맞추지 못했습니다. 거리를 조절한 뒤 다시 시도해 주세요.')
  }
  async function start() {
    if (opening.current || unavailable.current) return
    const problem = cameraSupport(); if (problem) { setError(problem); return }
    stop(); opening.current = true; const token = generation.current
    focusing.current = false; setRefocusing(false); setFocusAvailable(false)
    setError(''); setOpen(true); setMessage('후면 카메라와 자동초점을 준비하고 있습니다…')
    let pendingMedia: MediaStream | null = null
    try {
      const mobile = isAndroidApp() || window.matchMedia('(max-width: 1024px)').matches
      const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { zoom?: boolean }
      const videoConstraints: MediaTrackConstraints & { zoom?: { ideal: number } } = {
        facingMode: { ideal: 'environment' },
        ...(mobile ? { width: { ideal: 1920 }, height: { ideal: 1080 }, ...(supported.zoom ? { zoom: { ideal: 1 } } : {}) } : {}),
      }
      pendingMedia = mobile ? await openBarcodeCamera(videoConstraints, () => token === generation.current && !unavailable.current)
        : await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
      if (!pendingMedia) return
      if (token !== generation.current || unavailable.current) { pendingMedia.getTracks().forEach(t => t.stop()); return }
      stream.current = pendingMedia
      const track = pendingMedia.getVideoTracks()[0]
      const focus = mobile && track ? await configureCloseFocus(track) : ''
      if (token !== generation.current || unavailable.current) { pendingMedia.getTracks().forEach(t => t.stop()); return }
      const engine = await createCameraDecoder()
      if (token !== generation.current || unavailable.current) { engine.dispose(); return }
      decoder.current = engine
      const element = video.current
      if (!element) { close(); return }
      element.srcObject = pendingMedia; await element.play()
      if (token !== generation.current || unavailable.current) return
      // Keep the WebView's empty-video poster hidden until camera playback starts.
      element.dataset.ready = 'true'
      setFocusAvailable(!!track && canRefocus(track))
      setMessage(`${focus ? `${focus} · ` : ''}바코드 한 개를 중앙에 맞추세요. 흐리면 조금 떨어뜨려 초점을 맞춰 주세요.`)
      const started = Date.now()
      const detect = async () => {
        if (token !== generation.current || unavailable.current) return
        try {
          const codes = element.readyState >= 2 ? await engine.detect(element) : []
          if (token !== generation.current || unavailable.current) return
          if (codes.length === 1) {
            // Release camera and invalidate all frames before calling business logic.
            close(); callback.current(codes[0]); return
          }
          if (codes.length > 1) setMessage('여러 바코드가 보입니다. 한 개만 맞춰 주세요.')
          else if (Date.now() - started > 12000 && !focusing.current) setMessage('조명과 거리를 조절해 주세요. 흐리면 초점 다시 맞추기를 눌러 주세요.')
          timer.current = setTimeout(() => void detect(), 180)
        } catch (e) { if (token === generation.current) { close(); setError(cameraError(e)) } }
      }
      void detect()
    } catch (e) {
      pendingMedia?.getTracks().forEach(t => t.stop())
      if (token === generation.current) { close(); setError(cameraError(e)) }
    }
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) close() }
    document.addEventListener('visibilitychange', hide)
    return () => { stop(); document.removeEventListener('visibilitychange', hide) }
  }, [close, stop])
  useEffect(() => { if (!disabled) return; stop(); const id = setTimeout(() => setOpen(false), 0); return () => clearTimeout(id) }, [disabled, stop])
  return { video, open, message, error, start, close, focusAvailable, refocusing, refocus }
}
