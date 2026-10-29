// Hints only. All recipients fetch their own current server-authorized state.
export function notifyAccessChanged() {
  window.dispatchEvent(new Event('wms-access-changed'))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('wms-access')
    channel.postMessage('refresh')
    channel.close()
  }
}
