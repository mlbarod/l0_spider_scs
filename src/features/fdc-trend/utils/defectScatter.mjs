const COLORS = ["hsl(268 75% 52%)", "hsl(204 94% 40%)", "hsl(152 57% 34%)", "hsl(35 92% 48%)", "hsl(316 69% 44%)", "hsl(240 55% 50%)"]

// Query data arrays are immutable; cards sharing an ALL file reuse its preparation.
const allRangeCache = new WeakMap()
const backgroundCache = new WeakMap()
const extentCache = new WeakMap()
const EMPTY_POINTS = []

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
}

export function defectIsNg(point) {
  const isNg = (value) => normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "") === "NG"
  return isNg(point.final_decision ?? point.FINAL_DECISION)
    || (point.anomaly_type === "std" && isNg(point.std_result ?? point.STD_RESULT))
}

function pointIdentity(point) {
  const lot = normalizeText(point.lot_id ?? point.lot_wf), wafer = normalizeText(point.wafer_id)
  return lot && wafer ? JSON.stringify([lot, wafer]) : ""
}

export function defectStepPrefix(point) {
  return String(point.step_seq ?? "").trim().slice(0, 2) || "-"
}

function initialAllRange(allPoints) {
  if (allRangeCache.has(allPoints)) return allRangeCache.get(allPoints)
  let values = allPoints.map((point) => point.fab_value).filter(Number.isFinite)
  if (values.length >= 4) {
    const sorted = [...values].sort((a, b) => a - b)
    const percentile = (ratio) => {
      const position = (sorted.length - 1) * ratio, index = Math.floor(position), weight = position - index
      return sorted[index] * (1 - weight) + sorted[Math.ceil(position)] * weight
    }
    const q10 = percentile(0.1), q90 = percentile(0.9), iqr = q90 - q10
    if (iqr > 0) values = values.filter((value) => value >= q10 - 1.5 * iqr && value <= q90 + 1.5 * iqr)
  }
  for (const point of allPoints) if (defectIsNg(point)) values.push(point.fab_value)
  let min = Infinity, max = -Infinity
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value) }
  const range = { min, max }
  allRangeCache.set(allPoints, range)
  return range
}

export function defectInitialDomain(allPoints, selected) {
  const full = defectScatterDomain(allPoints, selected)
  let { min, max } = initialAllRange(allPoints)
  for (const point of selected) {
    if (point.isNg ?? defectIsNg(point)) { min = Math.min(min, point.fab_value); max = Math.max(max, point.fab_value) }
  }
  if (!Number.isFinite(min)) return full
  // 음수 max의 곱셈이 NG 값을 잘라내지 않도록 상한을 보정한다.
  return { x: full.x, y: [min - 2, max < 0 ? max + Math.abs(max) * 0.2 : max * 1.2] }
}

function pointExtent(points) {
  if (extentCache.has(points)) return extentCache.get(points)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.tkout_time); maxX = Math.max(maxX, point.tkout_time)
    minY = Math.min(minY, point.fab_value); maxY = Math.max(maxY, point.fab_value)
  }
  const extent = { minX, maxX, minY, maxY }
  extentCache.set(points, extent)
  return extent
}

export function defectScatterDomain(points, additional = EMPTY_POINTS) {
  if (!points.length && !additional.length) return { x: [0, 1], y: [0, 1] }
  const a = pointExtent(points), b = pointExtent(additional)
  const minX = Math.min(a.minX, b.minX), maxX = Math.max(a.maxX, b.maxX)
  const minY = Math.min(a.minY, b.minY), maxY = Math.max(a.maxY, b.maxY)
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

function prepareBackground(allPoints) {
  if (backgroundCache.has(allPoints)) return backgroundCache.get(allPoints)
  const background = new Map()
  const stepCounts = new Map()
  for (const point of allPoints) {
    const group = background.get(point.eqp_ch) ?? []
    group.push(point)
    background.set(point.eqp_ch, group)
    const step = defectStepPrefix(point)
    stepCounts.set(step, (stepCounts.get(step) ?? 0) + 1)
  }
  const steps = [...stepCounts.keys()].sort((a, b) => a.localeCompare(b))
  const stepColors = new Map(steps.map((step, index) => [step, COLORS[index % COLORS.length]]))
  const prepared = { background: [...background].map(([eqp_ch, points]) => ({ eqp_ch, points })), stepColors, stepCounts }
  backgroundCache.set(allPoints, prepared)
  return prepared
}

export function buildDefectScatterSeries(failPoints, allPoints, eqpCh) {
  const { background, stepColors, stepCounts } = prepareBackground(allPoints)
  const selectedPoints = failPoints.filter((point) => point.eqp_ch === eqpCh)
  const ngIdentities = new Set(selectedPoints.filter(defectIsNg).map(pointIdentity).filter(Boolean))
  const selected = selectedPoints.map((point) => ({ ...point, isNg: defectIsNg(point) || ngIdentities.has(pointIdentity(point)) }))
  const eqps = [...new Set([...background.map((group) => group.eqp_ch), eqpCh])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return {
    eqps,
    background,
    selected,
    stepColors,
    stepCounts,
  }
}

export function formatDefectTime(timestamp, full = false) {
  if (!Number.isFinite(Number(timestamp))) return ""
  const date = new Date(Number(timestamp))
  if (!Number.isFinite(date.getTime())) return ""
  const iso = date.toISOString()
  return full ? iso.slice(0, 19).replace("T", " ") : iso.slice(5, 16).replace("T", " ")
}
