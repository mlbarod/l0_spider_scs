import { useCallback, useMemo, useState } from "react"
import { buildDefectScatterSeries, defectInitialDomain, defectScatterDomain } from "../utils/defectScatter.mjs"
import { DefectScatterPlot } from "./DefectScatterPlot"

export function DefectScatterChart({ failData, allData, eqpCh }) {
  const [hidden, setHidden] = useState([])
  const [zoom, setZoom] = useState(null)
  const series = useMemo(() => buildDefectScatterSeries(failData.points ?? [], allData.points ?? [], eqpCh), [failData, allData, eqpCh])
  const baseDomain = useMemo(() => defectInitialDomain(allData.points ?? [], series.selected), [allData, series])
  const fullDomain = useMemo(() => defectScatterDomain(allData.points ?? [], series.selected), [allData, series])
  const resetZoom = useCallback(() => setZoom(fullDomain), [fullDomain])
  const domain = zoom ?? baseDomain
  const legendCounts = new Map(series.background.map(({ eqp_ch, points }) => [eqp_ch, points.length]))
  legendCounts.set(eqpCh, (legendCounts.get(eqpCh) ?? 0) + series.selected.length)
  const errors = [failData.scatter_error, allData.scatter_error].filter(Boolean)
  const invalidCount = (failData.invalid_point_count ?? 0) + (allData.invalid_point_count ?? 0)
  if (errors.length) return <p className="p-4 text-sm text-destructive" role="alert">{errors.join(" ")}</p>
  if (!series.selected.length && !series.background.some(({ points }) => points.length)) {
    return <p className="p-4 text-sm text-muted-foreground">표시할 tkout_time·fab_value 데이터가 없습니다.</p>
  }
  return (
    <div className="min-w-0" data-defect-scatter={eqpCh}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_116px] items-start gap-2 px-2 pt-2">
      <DefectScatterPlot series={series} hidden={hidden} domain={domain} onZoom={setZoom} onReset={resetZoom} />
      <aside className="h-[340px] overflow-y-auto rounded-md border bg-muted/25 p-2" aria-label="eqp_ch 범례">
        <p className="mb-2 text-[10px] font-semibold text-muted-foreground">eqp_ch</p>
        {series.eqps.map((eqp) => (
          <button key={eqp} type="button" aria-pressed={!hidden.includes(eqp)} title={eqp || "eqp_ch 없음"}
            className="grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1.5 text-left text-[10px] hover:bg-muted"
            style={{ opacity: hidden.includes(eqp) ? 0.4 : 1 }}
            onClick={() => setHidden((current) => current.includes(eqp) ? current.filter((value) => value !== eqp) : [...current, eqp])}>
            <span className="size-2 rounded-full" style={{ backgroundColor: eqp === eqpCh ? "hsl(0 72% 51%)" : "hsl(240 4% 64%)" }} />
            <span className="truncate">{eqp || "eqp_ch 없음"}</span>
            <span className="text-muted-foreground">{(legendCounts.get(eqp) ?? 0).toLocaleString()}</span>
          </button>
        ))}
        <p className="mb-2 mt-3 text-[10px] font-semibold text-muted-foreground">STEP</p>
        {[...series.stepColors].map(([step, color]) => (
          <div key={step} className="flex items-center gap-2 px-1 py-1 text-[10px]">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} />{step}
          </div>
        ))}
      </aside>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 text-[10px] text-muted-foreground">
        <span>오른쪽 아래로 드래그: 확대 · 반대 방향 또는 더블클릭: 초기화</span>
        <button type="button" className="shrink-0 rounded border px-2 py-1 hover:bg-muted" onClick={resetZoom}>범위 초기화</button>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted-foreground">작고 옅은 점: ALL (STEP별 색상) · 크고 진한 점: RAW (빨강 NG / 청록 그 외)</p>
      {invalidCount > 0 ? <p className="px-4 pb-3 text-xs text-muted-foreground">시간 또는 값이 유효하지 않은 {invalidCount}행은 표시에서 제외했습니다.</p> : null}
    </div>
  )
}
