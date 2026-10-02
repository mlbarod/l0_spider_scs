import { useMemo, useRef, useState } from "react"
import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts"
import { buildDefectScatterSeries, defectEqpColor, defectScatterDomain, formatDefectTime } from "../utils/defectScatter.mjs"

function DefectTooltip({ active, payload }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="space-y-1 rounded-md border bg-background p-3 text-xs shadow-md">
      <p>{point.eqp_ch || "eqp_ch 없음"}</p>
      <p>tkout_time: {formatDefectTime(point.tkout_time, true)}</p>
      <p>fab_value: {point.fab_value}</p>
    </div>
  )
}

function ScatterDot({ cx, cy, fill, selected = false }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return <circle data-defect-kind={selected ? "raw" : "all"} cx={cx} cy={cy} r={selected ? 3.7 : 1.25} fill={fill} fillOpacity={selected ? 1 : 0.24} stroke={selected ? "white" : "none"} strokeWidth={0.6} />
}

export function DefectScatterChart({ failData, allData, eqpCh }) {
  const [hidden, setHidden] = useState([])
  const [zoom, setZoom] = useState(null)
  const [drag, setDrag] = useState(null)
  const plotRef = useRef(null)
  const series = useMemo(() => buildDefectScatterSeries(failData.points ?? [], allData.points ?? [], eqpCh), [failData, allData, eqpCh])
  const baseDomain = useMemo(() => defectScatterDomain([...(allData.points ?? []), ...series.selected]), [allData, series])
  const domain = zoom ?? baseDomain
  const legendCounts = new Map(series.background.map(({ eqp_ch, points }) => [eqp_ch, points.length]))
  legendCounts.set(eqpCh, (legendCounts.get(eqpCh) ?? 0) + series.selected.length)
  const pointerPoint = (event) => {
    const rect = plotRef.current.getBoundingClientRect()
    const x = Math.min(rect.width - 16, Math.max(72, event.clientX - rect.left))
    const y = Math.min(272, Math.max(18, event.clientY - rect.top))
    return { px: x, py: y,
      x: domain.x[0] + (x - 72) / Math.max(1, rect.width - 88) * (domain.x[1] - domain.x[0]),
      y: domain.y[1] - (y - 18) / 254 * (domain.y[1] - domain.y[0]) }
  }
  const finishZoom = (event) => {
    if (!drag) return
    const end = pointerPoint(event)
    const dx = end.px - drag.start.px, dy = end.py - drag.start.py
    if (dx > 8 && dy > 8) setZoom({ x: [drag.start.x, end.x], y: [end.y, drag.start.y] })
    else if (dx < -8 && dy < -8) setZoom(null)
    setDrag(null)
  }
  const errors = [failData.scatter_error, allData.scatter_error].filter(Boolean)
  const invalidCount = (failData.invalid_point_count ?? 0) + (allData.invalid_point_count ?? 0)
  if (errors.length) return <p className="p-4 text-sm text-destructive" role="alert">{errors.join(" ")}</p>
  if (!series.selected.length && !series.background.some(({ points }) => points.length)) {
    return <p className="p-4 text-sm text-muted-foreground">표시할 tkout_time·fab_value 데이터가 없습니다.</p>
  }
  return (
    <div className="min-w-0" data-defect-scatter={eqpCh}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_116px] items-start gap-2 px-2 pt-2">
      <div ref={plotRef} className="h-[340px] min-w-0 w-full cursor-crosshair select-none touch-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const start = pointerPoint(event)
          setDrag({ start, end: start })
        }}
        onPointerMove={(event) => { if (drag) setDrag({ ...drag, end: pointerPoint(event) }) }}
        onPointerUp={finishZoom} onPointerCancel={() => setDrag(null)} onDoubleClick={() => setZoom(null)}>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 16, bottom: 22, left: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="tkout_time" scale="time" domain={domain.x} allowDataOverflow
              tickFormatter={(value) => formatDefectTime(value)} tick={{ fontSize: 10 }} minTickGap={35} height={46}
              label={{ value: "tkout_time", position: "insideBottom", offset: -10, fontSize: 11 }} />
            <YAxis type="number" dataKey="fab_value" domain={domain.y} allowDataOverflow width={68}
              tick={{ fontSize: 10 }} tickFormatter={(value) => Number(value).toLocaleString(undefined, { maximumSignificantDigits: 5 })}
              label={{ value: "fab_value", angle: -90, position: "insideLeft", fontSize: 11 }} />
            <Tooltip content={<DefectTooltip />} cursor={false} isAnimationActive={false} />
            {series.background.filter(({ eqp_ch }) => !hidden.includes(eqp_ch)).map(({ eqp_ch, points }) => (
              <Scatter key={eqp_ch} dataKey={`all:${eqp_ch}`} name={eqp_ch || "eqp_ch 없음"} data={points} fill={defectEqpColor(eqp_ch)}
                shape={<ScatterDot />} isAnimationActive={false} />
            ))}
            {!hidden.includes(eqpCh) ? (
              <Scatter dataKey={`fail:${eqpCh}`} name={eqpCh} data={series.selected} fill="hsl(0 72% 51%)"
                shape={<ScatterDot selected />} isAnimationActive={false} />
            ) : null}
            {drag ? <ReferenceArea x1={Math.min(drag.start.x, drag.end.x)} x2={Math.max(drag.start.x, drag.end.x)}
              y1={Math.min(drag.start.y, drag.end.y)} y2={Math.max(drag.start.y, drag.end.y)}
              stroke="var(--primary)" strokeDasharray="5 4" fill="var(--primary)" fillOpacity={0.12} /> : null}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <aside className="h-[340px] overflow-y-auto rounded-md border bg-muted/25 p-2" aria-label="eqp_ch 범례">
        <p className="mb-2 text-[10px] font-semibold text-muted-foreground">eqp_ch</p>
        {series.eqps.map((eqp) => (
          <button key={eqp} type="button" aria-pressed={!hidden.includes(eqp)} title={eqp || "eqp_ch 없음"}
            className="grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1.5 text-left text-[10px] hover:bg-muted"
            style={{ opacity: hidden.includes(eqp) ? 0.4 : 1 }}
            onClick={() => setHidden((current) => current.includes(eqp) ? current.filter((value) => value !== eqp) : [...current, eqp])}>
            <span className="size-2 rounded-full" style={{ backgroundColor: eqp === eqpCh ? "hsl(0 72% 51%)" : defectEqpColor(eqp) }} />
            <span className="truncate">{eqp || "eqp_ch 없음"}</span>
            <span className="text-muted-foreground">{(legendCounts.get(eqp) ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </aside>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 text-[10px] text-muted-foreground">
        <span>오른쪽 아래로 드래그: 확대 · 반대 방향 또는 더블클릭: 초기화</span>
        <button type="button" className="shrink-0 rounded border px-2 py-1 hover:bg-muted" onClick={() => setZoom(null)}>범위 초기화</button>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted-foreground">작고 옅은 점: 이상감지 스탭 ALL RAW데이터 · 크고 진한 점: 이상감지 RAW데이터</p>
      {invalidCount > 0 ? <p className="px-4 pb-3 text-xs text-muted-foreground">시간 또는 값이 유효하지 않은 {invalidCount}행은 표시에서 제외했습니다.</p> : null}
    </div>
  )
}
