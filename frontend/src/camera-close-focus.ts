type CameraCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number }; focusMode?: string[] }
type CameraSettings = MediaTrackSettings & { zoom?: number; focusMode?: string }
type CameraConstraint = MediaTrackConstraintSet & { zoom?: number; focusMode?: string }

export function canRefocus(track: MediaStreamTrack): boolean {
  try { return (track.getCapabilities?.() as CameraCapabilities)?.focusMode?.includes('single-shot') || false } catch { return false }
}

export function hasAutoFocus(track: MediaStreamTrack): boolean {
  try { return (track.getCapabilities?.() as CameraCapabilities)?.focusMode?.some(mode => mode === 'continuous' || mode === 'single-shot') || false } catch { return false }
}

export async function refocusCamera(track: MediaStreamTrack): Promise<boolean> {
  const ended = () => track.readyState === 'ended'
  if (ended() || !canRefocus(track)) return false
  const apply = (focusMode: string) => track.applyConstraints({ advanced: [{ focusMode } as CameraConstraint] })
  try {
    await apply('single-shot')
    // Give the lens time to sweep, then resume tracking as the barcode moves.
    await new Promise(resolve => setTimeout(resolve, 650))
    if (ended()) return false
    if ((track.getCapabilities() as CameraCapabilities).focusMode?.includes('continuous')) await apply('continuous')
    return true
  } catch { return false }
}

// Request only advertised controls. A missing/rejected optional control must not
// prevent scanning, and a fixed-focus lens cannot be turned into a macro lens.
export async function configureCloseFocus(track: MediaStreamTrack): Promise<string> {
  let capabilities: CameraCapabilities
  try { capabilities = track.getCapabilities?.() || {} } catch { return '' }
  const controls: CameraConstraint[] = []
  if (capabilities.zoom && capabilities.zoom.min <= 1 && capabilities.zoom.max >= 1) controls.push({ zoom: 1 })
  if (capabilities.focusMode?.includes('continuous')) controls.push({ focusMode: 'continuous' })
  else if (capabilities.focusMode?.includes('single-shot')) controls.push({ focusMode: 'single-shot' })
  for (const control of controls) {
    if (track.readyState === 'ended') return ''
    try { await track.applyConstraints({ advanced: [control] }) } catch { /* Keep the camera usable with its defaults. */ }
  }
  const settings = track.getSettings() as CameraSettings
  return [settings.zoom === 1 ? '1배' : '', settings.focusMode === 'continuous' ? '연속 자동초점' : ''].filter(Boolean).join(' · ')
}
