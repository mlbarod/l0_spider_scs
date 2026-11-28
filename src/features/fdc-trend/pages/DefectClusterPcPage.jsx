import { memo, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, ArrowUp, BookOpen, LoaderCircle } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n"

import { fetchClusterPcCatalog, fetchClusterPcHistory, fetchClusterPcMaps, saveClusterPcFeedback } from "../api/defectClusterPcApi"
import { clusterFilterOptions, clusterLabel, groupByHistory, groupByPrcEqp, waferKey, EMPTY_FILTERS, FILTERS, GRID_COLUMNS, NO_EQPID, NO_VALUE } from "../utils/defectClusterPc.mjs"
import "./defect-cluster-pc.css"

const MAP_SIZE = 168          // CSS px
const WAFER_RADIUS_01MM = 1500 // 150mm = 1500 (서버가 0.1mm 정수로 보낸다)
const MIN_CLUSTER_PX = 4       // 1.5mm 창은 map에서 1px 미만이라 최소 크기로 그린다(실제 반경은 카드 글자로 표시)
const ZONE_FILL = "rgba(37, 99, 235, 0.14)"
const CLUSTER_STROKE = "#2563eb"
const CLUSTER_STROKE_MINOR = "#86868b"

export const CLUSTER_PC_TEXT = {
  ko: {
    title: "몰림PC 이상감지", home: "SPIDER 메인으로", refresh: "리스트 새로고침", retry: "다시 시도",
    snapshot: (value) => `Defect SPIDER · 결과 기준 ${value}`, batch: "Defect SPIDER · 몰림PC 일일 배치 결과",
    filters: "몰림PC 필터", notConfigured: "몰림PC 결과 폴더를 찾지 못했습니다. 데이터 생성 상태를 확인하세요.",
    noResults: "몰림으로 검출된 wafer가 없습니다.", loading: "Loading…", noMatch: "일치하는 항목이 없습니다.",
    lineFirst: "Line Name을 먼저 선택하세요.", sdwtFirst: "SDWT를 먼저 선택하세요.",
    limit: (total, limit) => `검출 wafer ${total.toLocaleString()}매 중 ${limit}매만 표시합니다. 필터를 더 좁혀 주세요.`,
    prompt: "Line Name과 SDWT를 선택하면 몰림으로 검출된 wafer map을 EQPID별로 표시합니다.",
    mapsLoading: "wafer map을 불러오는 중입니다.", noWafers: "선택 조건에 해당하는 wafer가 없습니다.",
    legend: "몰림으로 검출된 wafer · 파란 원: 군집 창, 파란 음영: 비교 영역",
    groupSummary: (eqps, chambers, wafers) => `EQP ${eqps}개 · 챔버 ${chambers}개 · ${wafers}매`,
    eqpSummary: (chambers, wafers) => `챔버 ${chambers}개 · ${wafers}매`, wafers: (count) => `${count}매`,
    tkout: "설비 진행시간", ucc: (count) => `UCC:${count.toLocaleString()}개`, more: (count) => ` 외 ${count}`, hit: " (몰림 근거)",
    verdict: "몰림PC 판정", correct: "몰림PC 맞음", wrong: "몰림PC 아님", saving: "저장 중…", deleting: "취소 중…", top: "맨 위로",
    reason: "몰림PC 판정 사유 숨기기",
    history: "과거 7일내 이상건수:", historyCount: (count) => `${count.toLocaleString()}건`,
    historyOpen: (chamber, count) => `${chamber} 과거 7일내 이상 ${count}건 wafer map 보기`,
    historyTitle: (chamber) => `${chamber} 과거 7일내 이상 wafer map`, historyDescription: (eqpid) => `EQPID ${eqpid} · 최신 결과 제외 · 최근 결과부터 표시`,
    historyLoading: "과거 wafer map을 불러오는 중입니다.", noHistory: "과거 7일내 이상 이력이 없습니다.", resultTime: "결과 기준",
    none: "(없음)", noEqpid: "(EQPID 없음)", noUnit: "(unit 없음)",
    sortTitle: "설비호기 정렬 순서", sortPrc: "PRC Group", sortHistory: "7일내 이상건수", historyGroup: "과거 7일내 이상건수 많은 순",
    guide: "몰림PC 알고리즘 설명", guideDescription: "몰림PC 이상감지가 wafer를 판정하는 방법", guidePage: "/cluster-pc-algorithm.html",
  },
  en: {
    title: "Clustered PC Anomaly Detection", home: "SPIDER Home", refresh: "Refresh list", retry: "Retry",
    snapshot: (value) => `Defect SPIDER · Results as of ${value}`, batch: "Defect SPIDER · Daily clustered PC batch results",
    filters: "Clustered PC filters", notConfigured: "Clustered PC result folder was not found. Check the data generation status.",
    noResults: "No wafers were detected as clustered.", loading: "Loading…", noMatch: "No matching items.",
    lineFirst: "Select Line Name first.", sdwtFirst: "Select SDWT first.",
    limit: (total, limit) => `Showing only ${limit} of ${total.toLocaleString()} detected wafers. Narrow the filters.`,
    prompt: "Select Line Name and SDWT to show wafer maps detected as clustered, grouped by EQPID.",
    mapsLoading: "Loading wafer maps.", noWafers: "No wafers match the selected conditions.",
    legend: "Wafers detected as clustered · Blue circle: cluster window, blue shading: comparison area",
    groupSummary: (eqps, chambers, wafers) => `${eqps} EQP · ${chambers} chambers · ${wafers} wafers`,
    eqpSummary: (chambers, wafers) => `${chambers} chambers · ${wafers} wafers`, wafers: (count) => `${count} wafers`,
    tkout: "Equipment process time", ucc: (count) => `UCC:${count.toLocaleString()}`, more: (count) => ` +${count} more`, hit: " (clustering evidence)",
    verdict: "Clustered PC verdict", correct: "Clustered PC", wrong: "Not clustered PC", saving: "Saving…", deleting: "Canceling…", top: "Back to top",
    reason: "Hide clustered PC verdict reason",
    history: "Anomalies in past 7 days:", historyCount: (count) => `${count.toLocaleString()}`,
    historyOpen: (chamber, count) => `View ${count} wafer maps detected on ${chamber} in the past 7 days`,
    historyTitle: (chamber) => `${chamber} anomaly wafer maps in the past 7 days`, historyDescription: (eqpid) => `EQPID ${eqpid} · Latest results excluded · Newest first`,
    historyLoading: "Loading past wafer maps.", noHistory: "No anomalies in the past 7 days.", resultTime: "Result time",
    none: "(None)", noEqpid: "(No EQPID)", noUnit: "(No unit)",
    sortTitle: "Equipment sort order", sortPrc: "PRC Group", sortHistory: "Anomalies in 7 days", historyGroup: "Most anomalies in past 7 days first",
    guide: "Clustered PC Algorithm Guide", guideDescription: "How Clustered PC Anomaly Detection judges wafers", guidePage: "/cluster-pc-algorithm.en.html",
  },
  "zh-CN": {
    title: "聚集PC异常检测", home: "返回 SPIDER 首页", refresh: "刷新列表", retry: "重试",
    snapshot: (value) => `Defect SPIDER · 结果基准 ${value}`, batch: "Defect SPIDER · 聚集PC每日批处理结果",
    filters: "聚集PC筛选", notConfigured: "未找到聚集PC结果文件夹。请检查数据生成状态。",
    noResults: "没有检测为聚集的晶圆。", loading: "加载中…", noMatch: "没有匹配的项目。",
    lineFirst: "请先选择 Line Name。", sdwtFirst: "请先选择 SDWT。",
    limit: (total, limit) => `检测到 ${total.toLocaleString()} 片晶圆，仅显示 ${limit} 片。请缩小筛选范围。`,
    prompt: "选择 Line Name 和 SDWT 后，将按 EQPID 显示检测为聚集的晶圆 map。",
    mapsLoading: "正在加载晶圆 map。", noWafers: "没有符合所选条件的晶圆。",
    legend: "检测为聚集的晶圆 · 蓝色圆圈：聚集窗口，蓝色阴影：比较区域",
    groupSummary: (eqps, chambers, wafers) => `EQP ${eqps} 个 · 腔室 ${chambers} 个 · ${wafers} 片`,
    eqpSummary: (chambers, wafers) => `腔室 ${chambers} 个 · ${wafers} 片`, wafers: (count) => `${count} 片`,
    tkout: "设备进行时间", ucc: (count) => `UCC:${count.toLocaleString()}个`, more: (count) => ` 等 ${count} 个`, hit: "（聚集依据）",
    verdict: "聚集PC判定", correct: "是聚集PC", wrong: "不是聚集PC", saving: "保存中…", deleting: "取消中…", top: "回到顶部",
    reason: "隐藏聚集PC判定依据",
    history: "过去7天内异常数：", historyCount: (count) => `${count.toLocaleString()}件`,
    historyOpen: (chamber, count) => `查看 ${chamber} 过去7天内 ${count} 件异常晶圆 map`,
    historyTitle: (chamber) => `${chamber} 过去7天内异常晶圆 map`, historyDescription: (eqpid) => `EQPID ${eqpid} · 不含最新结果 · 从最近结果开始显示`,
    historyLoading: "正在加载过去的晶圆 map。", noHistory: "过去7天内没有异常记录。", resultTime: "结果基准",
    none: "（无）", noEqpid: "（无 EQPID）", noUnit: "（无 unit）",
    sortTitle: "设备号排序方式", sortPrc: "PRC Group", sortHistory: "7天内异常数", historyGroup: "按过去7天内异常数从多到少",
    guide: "聚集PC算法说明", guideDescription: "聚集PC异常检测如何判定晶圆", guidePage: "/cluster-pc-algorithm.zh-CN.html",
  },
}

// 데이터 값은 그대로 두고, 값이 없을 때 쓰는 표시값만 언어에 맞춘다.
const displayValue = (value, t) => (value === NO_VALUE ? t.none : value === NO_EQPID ? t.noEqpid : value)

function Pills({ title, values, selected, onSelect, disabled = false, loading = false, placeholder, t }) {
  return <div className="defect-filter-row" role="group" aria-label={title} aria-busy={loading}>
    <div className="defect-filter-label" data-disabled={disabled || undefined}>{title}{loading && <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />}</div>
    <div className="defect-filter-options">
      {!loading && !disabled && values.map((value) => <button type="button" key={value} className="defect-filter-pill" aria-pressed={selected === value} onClick={() => onSelect(value)} title={value}><span>{displayValue(value, t)}</span></button>)}
      {(loading || disabled || !values.length) && <span className="defect-filter-placeholder" role={loading ? "status" : undefined}>{loading ? t.loading : placeholder ?? t.noMatch}</span>}
    </div>
  </div>
}

// 비교 영역(몰림 판정 근거 군집만): 방향 비교 = 45° 부채꼴, 링 비교 = 가장 안쪽 원. 좌표는 mm, y축은 위가 +.
function drawZone(ctx, c, r, cluster) {
  const mm = r / 150
  ctx.fillStyle = ZONE_FILL
  ctx.beginPath()
  if (cluster.zone === "sector") {
    const mid = (cluster.deg * Math.PI) / 180, half = (cluster.width * Math.PI) / 360
    ctx.moveTo(c, c)
    ctx.arc(c, c, r, -(mid + half), -(mid - half))
    ctx.closePath()
  } else if (cluster.zone === "ring") {
    ctx.arc(c, c, cluster.zoneR * mm, 0, Math.PI * 2)
  }
  ctx.fill()
}

function drawCluster(ctx, c, r, cluster) {
  const mm = r / 150
  ctx.strokeStyle = cluster.hit ? CLUSTER_STROKE : CLUSTER_STROKE_MINOR
  ctx.lineWidth = cluster.hit ? 1.5 : 1
  ctx.setLineDash(cluster.hit ? [] : [3, 2])
  ctx.beginPath()
  ctx.arc(c + cluster.x * mm, c - cluster.y * mm, Math.max(MIN_CLUSTER_PX, cluster.r * mm), 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

// canvas 1장에 점을 직접 찍는다(SVG/DOM 점 대비 수천 개도 즉시 그린다).
// 화면에 보일 때만 그려서, wafer가 수백 매여도 첫 화면이 바로 나온다.
// 판정 사유(군집 원, 비교 영역)는 showReason일 때만 그린다.
const WaferCanvas = memo(function WaferCanvas({ xy, clusters, showReason }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof IntersectionObserver === "undefined") { setVisible(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: "400px 0px" })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !visible) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = MAP_SIZE * ratio
    canvas.height = MAP_SIZE * ratio
    const ctx = canvas.getContext("2d")
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    const c = MAP_SIZE / 2, r = c - 4, scale = r / WAFER_RADIUS_01MM
    ctx.fillStyle = "#fafafa"
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "#d2d2d7"
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(c - r, c); ctx.lineTo(c + r, c); ctx.moveTo(c, c - r); ctx.lineTo(c, c + r); ctx.stroke()
    if (showReason) for (const cluster of clusters) if (cluster.hit) drawZone(ctx, c, r, cluster)
    ctx.strokeStyle = "#52514e"
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = "#d9480f"
    for (let i = 0; i < xy.length; i += 2) ctx.fillRect(c + xy[i] * scale - 0.9, c - xy[i + 1] * scale - 0.9, 1.8, 1.8)
    if (showReason) for (const cluster of clusters) drawCluster(ctx, c, r, cluster)
  }, [xy, clusters, showReason, visible])
  return <canvas ref={ref} className="cluster-pc-canvas" style={{ width: MAP_SIZE, height: MAP_SIZE }} aria-hidden="true" />
})

const NO_CLUSTERS = []

const VERDICTS = ["correct", "wrong"]

// 판정 버튼: 저장에 성공한 판정만 눌린 상태로 보여준다(이 화면을 보는 동안만 기억).
// 다른 판정을 누르면 덮어쓰고, 눌린 판정을 다시 누르면 저장을 지우고 눌림을 푼다.
function FeedbackButtons({ state, onSave, t }) {
  return <div className="cluster-pc-feedback" role="group" aria-label={t.verdict}>
    {VERDICTS.map((verdict) => <button type="button" key={verdict} data-verdict={verdict}
      aria-pressed={state?.saved === verdict} disabled={Boolean(state?.saving)} onClick={() => onSave(verdict)}>
      {state?.saving === verdict ? (state.removing ? t.deleting : t.saving) : t[verdict]}
    </button>)}
  </div>
}

// showFeedback = false: 과거 이력 팝업(판정 저장은 최신 결과 wafer만 가능하다), Defect SPIDER 이상 wafer map 팝업
export function WaferCard({ wafer, feedback, onFeedback, showReason, t, language, showFeedback = true }) {
  const count = wafer.xy.length / 2
  const clusters = wafer.clusters || NO_CLUSTERS
  const main = clusters.filter((cluster) => cluster.hit).sort((a, b) => b.zoneRatio - a.zoneRatio)[0]
  const detail = clusters.map((cluster, index) => `#${index + 1} ${clusterLabel(cluster, language)}${cluster.hit ? t.hit : ""}`).join("\n")
  return <figure className="cluster-pc-wafer" title={`${wafer.lotWf}\n${wafer.device} · ${wafer.mainSeq} · ${wafer.metSeq}${detail ? `\n${detail}` : ""}`}>
    {/* map 좌측 상단: 설비 진행시간, device / 우측 상단: wafer 식별값(이전에는 map 하단에 표시). 값이 없으면 "-". */}
    <div className="cluster-pc-wafer-info">
      {[[...(wafer.snapshot ? [[t.resultTime, wafer.snapshot, " : "]] : []), [t.tkout, wafer.tkoutTime, " : "], ["device", wafer.device]],
        [["main_step", wafer.mainSeq], ["met_step", wafer.metSeq], ["lot_id", `${wafer.rootLotId || ""}${wafer.lotId || ""}`], ["slot", wafer.slot]]].map((items, side) =>
        <dl key={side}>{items.map(([label, value, separator = ": "]) => <div key={label}><dt>{label}{separator}</dt><dd>{value || "-"}</dd></div>)}</dl>)}
    </div>
    <WaferCanvas xy={wafer.xy} clusters={clusters} showReason={showReason} />
    {/* map 우측 하단: defect 수(UCC). 좌표 파일을 못 읽었으면 대신 오류를 하단 가운데에 보여준다. */}
    {!wafer.error && <div className="cluster-pc-wafer-ucc">{t.ucc(count)}</div>}
    <figcaption>
      {wafer.error && <span><em>{wafer.error}</em></span>}
      {main && <span className="cluster-pc-reason">{clusterLabel(main, language)}{clusters.length > 1 ? t.more(clusters.length - 1) : ""}</span>}
    </figcaption>
    {showFeedback && <FeedbackButtons state={feedback} onSave={(verdict) => onFeedback(wafer, verdict)} t={t} />}
  </figure>
}

// 챔버의 과거 7일 이상 wafer map 팝업. target = { line, eqpid, chamber } | null
function HistoryDialog({ snapshot, target, onClose, t, language }) {
  const [state, setState] = useState({ data: null, error: "" })
  useEffect(() => {
    if (!target) return
    const controller = new AbortController()
    let active = true
    setState({ data: null, error: "" })
    fetchClusterPcHistory(snapshot, target.line, target.eqpid, controller.signal).then((data) => {
      if (active) setState({ data, error: "" })
    }).catch((error) => {
      if (active && error.name !== "AbortError") setState({ data: null, error: error.message })
    })
    return () => { active = false; controller.abort() }
  }, [snapshot, target])
  const wafers = state.data?.wafers || []
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="cluster-pc-history-dialog sm:max-w-6xl">
      <DialogHeader>
        <DialogTitle>{target && t.historyTitle(target.chamber)}</DialogTitle>
        <DialogDescription>{target && t.historyDescription(target.eqpid)}</DialogDescription>
      </DialogHeader>
      <div>
        {!state.data && !state.error && <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t.historyLoading}</p>}
        {state.error && <p role="alert" className="py-12 text-center text-sm text-destructive">{state.error}</p>}
        {state.data && state.data.total > state.data.limit && <p role="status" className="mb-3 text-sm text-amber-900">{t.limit(state.data.total, state.data.limit)}</p>}
        {state.data && !wafers.length && <p className="py-12 text-center text-sm text-muted-foreground">{t.noHistory}</p>}
        {wafers.length > 0 && <div className="cluster-pc-history-grid">
          {wafers.map((wafer, index) => <WaferCard key={`${index}|${wafer.snapshot}|${waferKey(wafer)}`} wafer={wafer} showReason={false} showFeedback={false} t={t} language={language} />)}
        </div>}
      </div>
    </DialogContent>
  </Dialog>
}

export function DefectClusterPcPage() {
  const { language } = useLanguage()
  const t = CLUSTER_PC_TEXT[language] ?? CLUSTER_PC_TEXT.ko
  const container = useRef(null)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState("")
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [maps, setMaps] = useState({ data: null, loading: false, error: "" })
  const [feedback, setFeedback] = useState({})   // waferKey -> { saved, saving }. 결과 시각이 바뀌면 비운다.
  // 설비호기 정렬 순서: "prc"(PRC_Group별 묶음, 기본) | "history"(과거 7일내 이상건수 많은 챔버 순)
  const [sortMode, setSortMode] = useState("prc")

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetchClusterPcCatalog(controller.signal).then((data) => { if (active) setCatalog(data) }).catch((error) => {
      if (active && error.name !== "AbortError") setCatalogError(error.message)
    })
    return () => { active = false; controller.abort() }
  }, [catalogVersion])

  useEffect(() => {
    if (!catalog?.snapshot || !filters.line || !filters.sdwt) return
    const controller = new AbortController()
    let active = true
    fetchClusterPcMaps(catalog.snapshot, filters, controller.signal).then((data) => {
      if (active) setMaps({ data, loading: false, error: "" })
    }).catch((error) => {
      if (active && error.name !== "AbortError") setMaps({ data: null, loading: false, error: error.message })
    })
    return () => { active = false; controller.abort() }
  }, [catalog?.snapshot, filters])

  useEffect(() => { setFeedback({}) }, [catalog?.snapshot])
  // EQP별 "몰림PC 판정 사유 숨기기" 여부. 새 wafer map을 받으면 모두 판정 사유를 보여주는 상태로 시작한다.
  const [hiddenReasons, setHiddenReasons] = useState({})
  useEffect(() => { setHiddenReasons({}) }, [maps.data])
  const toggleReason = (key) => setHiddenReasons((previous) => ({ ...previous, [key]: !previous[key] }))
  // 과거 7일 이상 이력 팝업 대상 챔버
  const [historyTarget, setHistoryTarget] = useState(null)
  // 몰림PC 알고리즘 설명 팝업
  const [guideOpen, setGuideOpen] = useState(false)

  async function saveFeedback(wafer, verdict) {
    const key = waferKey(wafer)
    const remove = feedback[key]?.saved === verdict
    setFeedback((previous) => ({ ...previous, [key]: { ...previous[key], saving: verdict, removing: remove } }))
    try {
      await saveClusterPcFeedback({ snapshot: catalog.snapshot, wafer, verdict, remove })
      setFeedback((previous) => ({ ...previous, [key]: { saved: remove ? undefined : verdict } }))
    } catch (error) {
      setFeedback((previous) => ({ ...previous, [key]: { saved: previous[key]?.saved } }))
      toast.error(error.message)
    }
  }

  const options = useMemo(() => clusterFilterOptions(catalog?.rows || [], filters), [catalog, filters])
  const prcGroups = useMemo(() => sortMode === "history"
    ? (maps.data?.wafers.length ? [[t.historyGroup, groupByHistory(maps.data.wafers, maps.data.history)]] : [])
    : groupByPrcEqp(maps.data?.wafers || []), [maps.data, sortMode, t])
  const card = (wafer, index, showReason) => <WaferCard key={`${index}|${waferKey(wafer)}`} wafer={wafer} feedback={feedback[waferKey(wafer)]} onFeedback={saveFeedback} showReason={showReason} t={t} language={language} />

  // 상위 필터를 바꾸면 하위 필터는 처음 값(SDWT는 미선택, PRC_Group은 ALL)으로 되돌린다.
  function select(key, value) {
    const index = FILTERS.findIndex((filter) => filter.key === key)
    const next = { ...filters, [key]: value }
    for (const filter of FILTERS.slice(index + 1)) next[filter.key] = EMPTY_FILTERS[filter.key]
    setMaps({ data: null, loading: Boolean(next.line && next.sdwt), error: "" })
    setFilters(next)
  }
  function refresh() {
    setFilters(EMPTY_FILTERS)
    setMaps({ data: null, loading: false, error: "" })
    setCatalog(null)
    setCatalogError("")
    setCatalogVersion((value) => value + 1)
  }

  const waferCount = maps.data?.wafers.length || 0
  return <div ref={container} className="defect-list-page relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card py-4 pl-6 pr-20">
      <div><h1 className="text-xl font-semibold">{t.title}</h1><p className="defect-list-description">{catalog?.snapshot ? t.snapshot(catalog.snapshot) : t.batch}</p></div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={refresh}>{t.refresh}</Button>
        <Button variant="outline" size="sm" asChild><Link to="/"><ArrowLeft className="size-4" aria-hidden="true" />{t.home}</Link></Button>
      </div>
    </header>
    <section aria-label={t.filters} className="defect-filters">
      {catalogError && <div role="alert" className="defect-filter-error"><span>{catalogError}</span><button type="button" className="defect-filter-pill" onClick={refresh}>{t.retry}</button></div>}
      {catalog?.configured === false && <p role="status" className="defect-filter-notice">{t.notConfigured}</p>}
      {catalog?.configured && !catalog.rows.length && <p role="status" className="defect-filter-notice">{t.noResults}</p>}
      {/* 필터 오른쪽 빈 공간: 몰림PC 알고리즘 설명(public/cluster-pc-algorithm*.html) 팝업 버튼 */}
      <div className="cluster-pc-filter-body">
      <div className="defect-filter-rows">
        <Pills t={t} title="Line Name" values={options.line} selected={filters.line} loading={!catalog && !catalogError} onSelect={(value) => select("line", value)} />
        <Pills t={t} title="SDWT" values={filters.line ? options.sdwt : []} selected={filters.sdwt} disabled={!filters.line} placeholder={!filters.line ? t.lineFirst : undefined} onSelect={(value) => select("sdwt", value)} />
        <Pills t={t} title="PRC_Group" values={["ALL", ...options.prcGroup]} selected={filters.prcGroup} disabled={!filters.line || !filters.sdwt} placeholder={!filters.line ? t.lineFirst : !filters.sdwt ? t.sdwtFirst : undefined} onSelect={(value) => select("prcGroup", value)} />
        <div className="defect-filter-row" role="group" aria-label={t.sortTitle}>
          <div className="defect-filter-label">{t.sortTitle}</div>
          <div className="defect-filter-options">
            {[["prc", t.sortPrc], ["history", t.sortHistory]].map(([mode, label]) => <button type="button" key={mode} className="defect-filter-pill" aria-pressed={sortMode === mode} onClick={() => setSortMode(mode)} title={label}><span>{label}</span></button>)}
          </div>
        </div>
      </div>
      <Button type="button" variant="outline" className="cluster-pc-guide-button" onClick={() => setGuideOpen(true)}><BookOpen aria-hidden="true" className="size-5" />{t.guide}</Button>
      </div>
    </section>
    <main className="defect-list-content space-y-4">
      {maps.data && maps.data.total > maps.data.limit && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {t.limit(maps.data.total, maps.data.limit)}
      </div>}
      {(!filters.line || !filters.sdwt) && <p className="py-20 text-center text-sm text-muted-foreground">{t.prompt}</p>}
      {maps.loading && <p role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t.mapsLoading}</p>}
      {maps.error && <div role="alert" className="py-12 text-center text-sm"><p className="text-destructive">{maps.error}</p><Button className="mt-4" variant="outline" onClick={() => { setMaps({ data: null, loading: true, error: "" }); setFilters({ ...filters }) }}>{t.retry}</Button></div>}
      {maps.data && !waferCount && <p className="py-20 text-center text-sm text-muted-foreground">{t.noWafers}</p>}
      {prcGroups.map(([prcGroup, eqps]) => <section key={prcGroup} aria-label={sortMode === "history" ? prcGroup : `PRC_Group ${prcGroup}`} className="defect-scatter-card cluster-pc-group">
        <div className="defect-scatter-header"><div><h2>{displayValue(prcGroup, t)}</h2><p>{t.legend}</p></div>
          <span>{t.groupSummary(new Set(eqps.map((eqp) => eqp.eqp)).size, eqps.reduce((sum, eqp) => sum + eqp.chambers.length, 0), eqps.reduce((sum, eqp) => sum + eqp.count, 0))}</span></div>
        {/* 5칸 격자: EQP 묶음은 챔버 칸 수 합만큼, 챔버 묶음은 wafer 수만큼(각각 최대 5칸) 차지한다. */}
        <div className="cluster-pc-eqp-grid" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}>
          {eqps.map((eqp) => <div key={eqp.id ?? eqp.eqp} role="group" aria-label={`EQP ${eqp.eqp}`} className="cluster-pc-eqp" style={{ gridColumn: `span ${eqp.span}` }}>
            <div className="cluster-pc-eqp-title">
              <div className="cluster-pc-eqp-name"><strong title={eqp.eqp}>{displayValue(eqp.eqp, t)}</strong>
                <button type="button" className="cluster-pc-reason-toggle" aria-pressed={Boolean(hiddenReasons[`${prcGroup}|${eqp.id ?? eqp.eqp}`])} onClick={() => toggleReason(`${prcGroup}|${eqp.id ?? eqp.eqp}`)}>{t.reason}</button></div>
              <span>{t.eqpSummary(eqp.chambers.length, eqp.count)}</span>
            </div>
            <div className="cluster-pc-chamber-grid" style={{ gridTemplateColumns: `repeat(${eqp.span}, minmax(0, 1fr))` }}>
              {eqp.chambers.map((chamber) => <div key={chamber.eqpid} role="group" aria-label={`EQPID ${chamber.eqpid}`} className="cluster-pc-chamber" style={{ gridColumn: `span ${chamber.span}` }}>
                <div className="cluster-pc-chamber-title" title={chamber.eqpid}>
                  <div className="cluster-pc-chamber-name"><strong>{displayValue(chamber.chamber, t)}</strong>
                    {/* 과거 7일 이상 wafer 수. 1건 이상이면 눌러서 그 wafer map을 팝업으로 본다. */}
                    {typeof maps.data.history?.[chamber.eqpid] === "number" && <span className="cluster-pc-history">{t.history}
                      {maps.data.history[chamber.eqpid] > 0
                        ? <button type="button" aria-label={t.historyOpen(displayValue(chamber.chamber, t), maps.data.history[chamber.eqpid])} onClick={() => setHistoryTarget({ line: chamber.wafers[0].line, eqpid: chamber.eqpid, chamber: displayValue(chamber.chamber, t) })}>{t.historyCount(maps.data.history[chamber.eqpid])}</button>
                        : <b>{t.historyCount(0)}</b>}</span>}
                  </div>
                  <span>{t.wafers(chamber.wafers.length)}</span>
                </div>
                {/* unit_id가 있는 wafer가 있으면 챔버 안을 unit_id 값별로 묶는다. unit_id가 없는 wafer는 맨 뒤 묶음. */}
                {chamber.units.length
                  ? chamber.units.map((unit) => <div key={unit.unit} role="group" aria-label={unit.unit ? `Unit ${unit.unit}` : t.noUnit} className="cluster-pc-unit">
                    <div className="cluster-pc-unit-title"><strong>{unit.unit ? `Unit: ${unit.unit}` : t.noUnit}</strong><span>{t.wafers(unit.wafers.length)}</span></div>
                    <div className="cluster-pc-eqp-wafers" style={{ gridTemplateColumns: `repeat(${chamber.span}, minmax(0, 1fr))` }}>{unit.wafers.map((wafer, index) => card(wafer, index, !hiddenReasons[`${prcGroup}|${eqp.id ?? eqp.eqp}`]))}</div>
                  </div>)
                  : <div className="cluster-pc-eqp-wafers" style={{ gridTemplateColumns: `repeat(${chamber.span}, minmax(0, 1fr))` }}>{chamber.wafers.map((wafer, index) => card(wafer, index, !hiddenReasons[`${prcGroup}|${eqp.id ?? eqp.eqp}`]))}</div>}
              </div>)}
            </div>
          </div>)}
        </div>
      </section>)}
    </main>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="cluster-pc-guide-dialog sm:max-w-[1040px]">
        <DialogHeader>
          <DialogTitle>{t.guide}</DialogTitle>
          <DialogDescription className="sr-only">{t.guideDescription}</DialogDescription>
        </DialogHeader>
        {/* 팝업을 열면 포커스가 iframe 안으로 들어가 Esc가 팝업에 전달되지 않는다. 같은 출처 페이지라 안에서 Esc를 받아 닫는다. */}
        <iframe src={t.guidePage} title={t.guide} className="cluster-pc-guide-frame"
          onLoad={(event) => event.currentTarget.contentWindow?.addEventListener("keydown", (key) => { if (key.key === "Escape") setGuideOpen(false) })} />
      </DialogContent>
    </Dialog>
    <HistoryDialog snapshot={catalog?.snapshot} target={historyTarget} onClose={() => setHistoryTarget(null)} t={t} language={language} />
    <button type="button" className="defect-back-to-top" aria-label={t.top} title={t.top} onClick={() => container.current?.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp aria-hidden="true" className="size-4" /></button>
  </div>
}
