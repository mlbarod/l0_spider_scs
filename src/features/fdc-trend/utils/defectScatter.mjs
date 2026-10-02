const COLORS = ["hsl(268 75% 52%)", "hsl(204 94% 40%)", "hsl(152 57% 34%)", "hsl(35 92% 48%)", "hsl(316 69% 44%)", "hsl(240 55% 50%)"]

export function defectEqpColor(eqpCh) {
  let hash = 0
  for (const char of eqpCh) hash = ((hash * 31) + char.codePointAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function defectScatterDomain(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.tkout_time); maxX = Math.max(maxX, point.tkout_time)
    minY = Math.min(minY, point.fab_value); maxY = Math.max(maxY, point.fab_value)
  }
  if (!points.length) return { x: [0, 1], y: [0, 1] }
  const dx = (maxX - minX) * 0.02 || 60000
  const dy = (maxY - minY) * 0.05 || Math.max(1, Math.abs(minY) * 0.05)
  return { x: [minX - dx, maxX + dx], y: [minY - dy, maxY + dy] }
}

export function defectChartTitle(eqpCh, mainSeq, metSeq) {
  const value = String(metSeq ?? "")
  const separator = value.indexOf("_")
  return [eqpCh, mainSeq || "—", separator < 0 ? value || "—" : value.slice(0, separator) || "—",
    separator < 0 ? "—" : value.slice(separator + 1) || "—"].join(" / ")
}

export function buildDefectScatterSeries(failPoints, allPoints, eqpCh) {
  const background = new Map()
  for (const point of allPoints) {
    const group = background.get(point.eqp_ch) ?? []
    group.push(point)
    background.set(point.eqp_ch, group)
  }
  const selected = failPoints.filter((point) => point.eqp_ch === eqpCh)
  const eqps = [...new Set([...background.keys(), eqpCh])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return {
    eqps,
    background: [...background].map(([eqp_ch, points]) => ({ eqp_ch, points })),
    selected,
  }
}

export function formatDefectTime(timestamp, full = false) {
  if (!Number.isFinite(Number(timestamp))) return ""
  const date = new Date(Number(timestamp))
  if (!Number.isFinite(date.getTime())) return ""
  const iso = date.toISOString()
  return full ? iso.slice(0, 19).replace("T", " ") : iso.slice(5, 16).replace("T", " ")
}
