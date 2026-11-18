import { hasAutoFocus } from './camera-close-focus.ts'

// Remember a verified rear autofocus camera for this page session only. Device IDs
// are discovered after permission; no model-specific camera number is hardcoded.
let preferredCamera = ''
const isRear = (label: string) => /back|rear|environment|후면|후방/i.test(label) && !/front|user|전면/i.test(label)

export async function openBarcodeCamera(
  video: MediaTrackConstraints,
  isCurrent: () => boolean,
  media: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'> = navigator.mediaDevices,
): Promise<MediaStream | null> {
  let owned: MediaStream | null = null
  const release = () => { owned?.getTracks().forEach(track => track.stop()); owned = null }
  const open = async (deviceId = '') => {
    owned = await media.getUserMedia({ video: { ...video, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, audio: false })
    return isCurrent()
  }
  const keep = () => {
    if (!isCurrent()) { release(); return null }
    const result = owned; owned = null; return result
  }
  try {
    try { if (!await open(preferredCamera)) return null }
    catch (error) {
      if (!preferredCamera || !(error instanceof Error) || !['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error
      preferredCamera = ''
      if (!isCurrent() || !await open()) return null
    }
    const original = owned!.getVideoTracks()[0]
    if (!original || hasAutoFocus(original)) return keep()
    const originalId = original.getSettings().deviceId
    let devices: MediaDeviceInfo[]
    try { devices = await media.enumerateDevices() } catch { return keep() }
    const candidates = devices.filter(device => device.kind === 'videoinput' && device.deviceId !== originalId && isRear(device.label))
    if (!candidates.length) return keep()
    for (const candidate of candidates) {
      release()
      if (!isCurrent()) return null
      try { if (!await open(candidate.deviceId)) return null } catch { continue }
      const track = owned!.getVideoTracks()[0]
      if (track && track.getSettings().facingMode !== 'user' && hasAutoFocus(track)) {
        preferredCamera = candidate.deviceId
        return keep()
      }
    }
    // Unsupported or unavailable alternatives must not break the original camera.
    release()
    if (!isCurrent() || !await open(originalId)) return null
    return keep()
  } finally { release() }
}
