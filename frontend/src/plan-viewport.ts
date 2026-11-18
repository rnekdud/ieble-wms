// Display-only geometry. Stored normalized coordinates and physical IDs are untouched.
export function fitPlanViewport(viewportWidth: number, viewportHeight: number, aspectRatio: number) {
  const width = 1200, height = width / aspectRatio
  const padding = Math.min(16, Math.max(4, Math.min(viewportWidth, viewportHeight) * .025))
  const scale = Math.max(.001, Math.min((viewportWidth - padding * 2) / width, (viewportHeight - padding * 2) / height))
  return { scale, x: (viewportWidth - width * scale) / 2, y: (viewportHeight - height * scale) / 2 }
}
