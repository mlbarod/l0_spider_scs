import { memo, useEffect, useRef, useState } from "react"
import { CartesianGrid, ScatterChart, XAxis, YAxis } from "recharts"
import { formatDefectTime } from "../utils/defectScatter.mjs"
import { DEFECT_PLOT, defectPlotPoint, drawDefectScatter, findDefectPoint } from "../utils/defectScatterCanvas.mjs"

const DefectAxes = memo(function DefectAxes({ width, domain }) {
  // With points on Canvas, the time axis has no Scatter data to derive ticks from.
  const tickIntervals = Math.max(1, Math.floor((width - DEFECT_PLOT.left - DEFECT_PLOT.right) / 110))
  const timeTicks = Array.from({ length: tickIntervals + 1 }, (_, index) => domain.x[0] + (domain.x[1] - domain.x[0]) * index / tickIntervals)
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <ScatterChart width={width} height={DEFECT_PLOT.height} margin={{ top: 18, right: 16, bottom: 22, left: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis type="number" dataKey="tkout_time" scale="time" domain={domain.x} ticks={timeTicks} allowDataOverflow
          tickFormatter={(value) => formatDefectTime(value)} tick={{ fontSize: 10 }} minTickGap={35} height={46}
          label={{ value: "tkout_time", position: "insideBottom", offset: -10, fontSize: 11 }} />
        <YAxis type="number" dataKey="fab_value" domain={domain.y} allowDataOverflow width={68}
          tick={{ fontSize: 10 }} tickFormatter={(value) => (Math.trunc(Number(value)) || 0).toLocaleString()}
          label={{ value: "fab_value", angle: -90, position: "insideLeft", fontSize: 11 }} />
      </ScatterChart>
    </div>
  )
})

export const DefectScatterPlot = memo(function DefectScatterPlot({ series, hidden, domain, onZoom, onResetInitial, onShowFullRange }) {
  const plotRef = useRef(null), canvasRef = useRef(null), selectionRef = useRef(null), tooltipRef = useRef(null)
  const dragRef = useRef(null), frameRef = useRef(null), indexRef = useRef(null), hoverRef = useRef(null)
  const [size, setSize] = useState({ width: 0, pixelRatio: 1 })
  useEffect(() => {
    const element = plotRef.current
    const measure = () => {
      const width = element.clientWidth, pixelRatio = window.devicePixelRatio || 1
      setSize((previous) => previous.width === width && previous.pixelRatio === pixelRatio ? previous : { width, pixelRatio })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener("resize", measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener("resize", measure) }
  }, [])
  useEffect(() => {
    if (size.width <= DEFECT_PLOT.left + DEFECT_PLOT.right) return
    indexRef.current = drawDefectScatter(canvasRef.current, { series, hidden, domain, ...size })
    tooltipRef.current.style.display = "none"
    hoverRef.current = null
    const selection = selectionRef.current
    // Any pending pointer work belongs to the previous domain/size.
    return () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      dragRef.current = null
      selection.style.display = "none"
      indexRef.current = null
    }
  }, [series, hidden, domain, size])
  const cancelFrame = () => { cancelAnimationFrame(frameRef.current); frameRef.current = null }
  const clearDrag = () => {
    cancelFrame()
    dragRef.current = null
    selectionRef.current.style.display = "none"
  }
  const relativePoint = (event, rect = plotRef.current.getBoundingClientRect()) => ({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  const move = (event) => {
    const drag = dragRef.current
    if (drag && event.pointerId !== drag.pointerId) return
    const position = relativePoint(event, drag?.rect)
    cancelFrame()
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      if (drag) {
        const end = defectPlotPoint(position.x, position.y, size.width, domain)
        const style = selectionRef.current.style
        style.display = "block"
        style.transform = `translate(${Math.min(drag.start.px, end.px)}px, ${Math.min(drag.start.py, end.py)}px)`
        style.width = `${Math.abs(end.px - drag.start.px)}px`
        style.height = `${Math.abs(end.py - drag.start.py)}px`
      } else {
        const match = indexRef.current && position.x >= DEFECT_PLOT.left && position.x <= size.width - DEFECT_PLOT.right
          && position.y >= DEFECT_PLOT.top && position.y <= DEFECT_PLOT.bottom
          ? findDefectPoint(indexRef.current, position.x, position.y) : null
        const tooltip = tooltipRef.current
        if (!match) { tooltip.style.display = "none"; hoverRef.current = null; return }
        if (hoverRef.current !== match.point) {
          tooltip.children[0].textContent = match.point.eqp_ch || "eqp_ch 없음"
          tooltip.children[1].textContent = `tkout_time: ${formatDefectTime(match.point.tkout_time, true)}`
          tooltip.children[2].textContent = `fab_value: ${match.point.fab_value}`
          hoverRef.current = match.point
        }
        tooltip.style.display = "block"
        tooltip.style.transform = `translate(${Math.max(0, Math.min(size.width - tooltip.offsetWidth, position.x + 12))}px, ${Math.max(0, position.y - tooltip.offsetHeight - 12)}px)`
      }
    })
  }
  return (
    <div ref={plotRef} className="relative h-[340px] min-w-0 w-full cursor-crosshair select-none touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        const rect = plotRef.current.getBoundingClientRect(), position = relativePoint(event, rect)
        if (position.x < DEFECT_PLOT.left || position.x > size.width - DEFECT_PLOT.right || position.y < DEFECT_PLOT.top || position.y > DEFECT_PLOT.bottom) return
        cancelFrame()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { start: defectPlotPoint(position.x, position.y, size.width, domain), rect, pointerId: event.pointerId }
        tooltipRef.current.style.display = "none"
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (!drag || event.pointerId !== drag.pointerId) return
        const position = relativePoint(event, drag.rect), end = defectPlotPoint(position.x, position.y, size.width, domain)
        const dx = end.px - drag.start.px, dy = end.py - drag.start.py
        clearDrag()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (dx > 8 && dy > 8) onZoom({ x: [drag.start.x, end.x], y: [end.y, drag.start.y] })
        else if (dx < -8 && dy < -8) onResetInitial()
      }}
      onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}
      onPointerLeave={() => { if (!dragRef.current) { cancelFrame(); tooltipRef.current.style.display = "none" } }}
      onDoubleClick={onShowFullRange}>
      {size.width > 88 ? <DefectAxes width={size.width} domain={domain} /> : null}
      <canvas ref={canvasRef} data-defect-canvas className="pointer-events-none absolute inset-0 h-full w-full"
        role="img" aria-label="tkout_time별 fab_value 산점도. ALL은 STEP별 색상, RAW는 NG 빨강·그 외 청록색." />
      <div ref={selectionRef} data-defect-selection className="pointer-events-none absolute left-0 top-0 border border-dashed border-primary bg-primary/10" style={{ display: "none" }} />
      <div ref={tooltipRef} role="tooltip" className="pointer-events-none absolute left-0 top-0 z-10 w-max max-w-full space-y-1 rounded-md border bg-background p-3 text-xs shadow-md" style={{ display: "none" }}>
        <p /><p /><p />
      </div>
    </div>
  )
})
