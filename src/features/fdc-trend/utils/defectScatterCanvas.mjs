import { defectStepPrefix } from "./defectScatter.mjs"

export const DEFECT_PLOT = { left: 72, right: 16, top: 18, bottom: 272, height: 340 }

export function defectPlotPoint(x, y, width, domain) {
  const px = Math.max(DEFECT_PLOT.left, Math.min(width - DEFECT_PLOT.right, x))
  const py = Math.max(DEFECT_PLOT.top, Math.min(DEFECT_PLOT.bottom, y))
  return { px, py,
    x: domain.x[0] + (px - DEFECT_PLOT.left) / Math.max(1, width - DEFECT_PLOT.left - DEFECT_PLOT.right) * (domain.x[1] - domain.x[0]),
    y: domain.y[1] - (py - DEFECT_PLOT.top) / (DEFECT_PLOT.bottom - DEFECT_PLOT.top) * (domain.y[1] - domain.y[0]) }
}

// A single representative per screen pixel bounds hover work even for dense clouds.
// RAW is painted last and takes precedence over coincident ALL points.
export function findDefectPoint(index, x, y) {
  let nearest = null, distance = 64
  for (let py = Math.floor(y) - 8; py <= Math.ceil(y) + 8; py += 1) {
    for (let px = Math.floor(x) - 8; px <= Math.ceil(x) + 8; px += 1) {
      if (px < 0 || px >= index.width || py < DEFECT_PLOT.top || py > DEFECT_PLOT.bottom) continue
      const candidate = index.pixels.get(py * index.width + px)
      if (!candidate) continue
      const nextDistance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2
      if (nextDistance < distance || (nextDistance === distance && candidate.selected)) {
        nearest = candidate
        distance = nextDistance
      }
    }
  }
  return nearest
}

export function drawDefectScatter(canvas, { series, hidden, domain, width, pixelRatio }) {
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(DEFECT_PLOT.height * pixelRatio)
  const context = canvas.getContext("2d")
  context.scale(pixelRatio, pixelRatio)
  const index = { width: Math.ceil(width), pixels: new Map() }
  const sprites = new Map()
  const spriteFor = (color, selected) => {
    const key = `${color}:${selected}`
    if (sprites.has(key)) return sprites.get(key)
    const sprite = document.createElement("canvas")
    sprite.width = sprite.height = Math.ceil(12 * pixelRatio)
    const ctx = sprite.getContext("2d")
    ctx.scale(pixelRatio, pixelRatio)
    ctx.beginPath()
    ctx.arc(6, 6, selected ? 3.7 : 1.25, 0, Math.PI * 2)
    ctx.globalAlpha = selected ? 1 : 0.24
    ctx.fillStyle = color
    ctx.fill()
    if (selected) { ctx.strokeStyle = "white"; ctx.lineWidth = 0.6; ctx.stroke() }
    sprites.set(key, sprite)
    return sprite
  }
  const xScale = (width - DEFECT_PLOT.left - DEFECT_PLOT.right) / (domain.x[1] - domain.x[0])
  const yScale = (DEFECT_PLOT.bottom - DEFECT_PLOT.top) / (domain.y[1] - domain.y[0])
  const draw = (point, selected) => {
    if (point.tkout_time < domain.x[0] || point.tkout_time > domain.x[1]
      || point.fab_value < domain.y[0] || point.fab_value > domain.y[1]) return
    const x = DEFECT_PLOT.left + (point.tkout_time - domain.x[0]) * xScale
    const y = DEFECT_PLOT.bottom - (point.fab_value - domain.y[0]) * yScale
    const color = selected ? point.isNg ? "hsl(0 72% 51%)" : "oklch(0.398 0.07 227.392)"
      : series.stepColors.get(defectStepPrefix(point))
    // Sprites preserve alpha accumulation for overlapping background points.
    context.drawImage(spriteFor(color, selected), x - 6, y - 6, 12, 12)
    const key = Math.round(y) * index.width + Math.round(x)
    index.pixels.set(key, { x, y, point, selected })
  }
  context.save()
  context.beginPath()
  context.rect(DEFECT_PLOT.left, DEFECT_PLOT.top, width - DEFECT_PLOT.left - DEFECT_PLOT.right, DEFECT_PLOT.bottom - DEFECT_PLOT.top)
  context.clip()
  const hiddenEqps = new Set(hidden)
  for (const group of series.background) {
    if (!hiddenEqps.has(group.eqp_ch)) for (const point of group.points) draw(point, false)
  }
  for (const point of series.selected) if (!hiddenEqps.has(point.eqp_ch)) draw(point, true)
  context.restore()
  return index
}
